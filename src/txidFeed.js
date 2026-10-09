const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

const feeds = new Map();
const MIN_DELAY_MS = 30_000;
const MAX_DELAY_MS = 180_000;
const CHAIN_API_URL = 'https://api.blockcypher.com/v1/ltc/main';
const PRICE_API_URL = 'https://api.exchange.coinbase.com/products/LTC-USD/trades?limit=1';
const MAX_USD_VALUE = 2_500;
const HIGH_VALUE_THRESHOLD = 1_000;
const FILTER_RETRY_MS = 10_000;
const ERROR_RETRY_MS = 60_000;

function randomDelay() {
  return Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1)) + MIN_DELAY_MS;
}

function litoshisToLtc(value) {
  return (Number(value || 0) / 100_000_000).toFixed(8);
}

async function requestJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'ICEMM-Txid-Feed/1.0' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`API request returned ${response.status}`);
  return response.json();
}

async function fetchRandomTransaction(seen) {
  const [chain, trades] = await Promise.all([
    requestJson(CHAIN_API_URL),
    requestJson(PRICE_API_URL),
  ]);
  if (!chain.latest_url) throw new Error('Litecoin API did not return the latest confirmed block');
  const ltcUsd = Number(Array.isArray(trades) ? trades[0]?.price : 0);
  if (!Number.isFinite(ltcUsd) || ltcUsd <= 0) throw new Error('Could not retrieve the LTC/USD price');

  const block = await requestJson(chain.latest_url);
  const txids = Array.isArray(block.txids) ? block.txids.filter(Boolean) : [];
  if (!txids.length) throw new Error('The latest confirmed block had no transaction IDs');

  const candidates = txids.filter(hash => !seen.has(hash));
  const pool = candidates.length ? candidates : txids;
  const hash = pool[Math.floor(Math.random() * pool.length)];
  const tx = await requestJson(`${CHAIN_API_URL}/txs/${hash}`);
  const ltcValue = Number(tx.total || 0) / 100_000_000;
  const usdValue = ltcValue * ltcUsd;

  if (!tx?.hash || Number(tx.confirmations || 0) < 1) {
    throw new Error('The selected Litecoin transaction is not confirmed');
  }
  if (usdValue > MAX_USD_VALUE) {
    throw new Error(`Transaction skipped because it is above $${MAX_USD_VALUE}`);
  }
  if (usdValue >= HIGH_VALUE_THRESHOLD && Math.random() > 0.10) {
    throw new Error(`High-value transaction skipped by rarity filter`);
  }
  return { ...tx, ltcUsd, usdValue };
}

function shorten(value, start = 6, end = 6) {
  if (!value) return 'Unknown';
  const text = String(value);
  return text.length > start + end + 3 ? `${text.slice(0, start)}...${text.slice(-end)}` : text;
}

function transactionMessage(tx) {
  const total = Array.isArray(tx.outputs)
    ? tx.outputs.reduce((sum, output) => sum + Number(output.value || 0), 0)
    : Number(tx.total || 0);
  const ltcAmount = litoshisToLtc(total);
  const usdAmount = tx.usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const explorerUrl = `https://live.blockcypher.com/ltc/tx/${tx.hash}/`;

  const embed = new EmbedBuilder()
    .setTitle('LTC Transaction Confirmed')
    .setColor('#3AB795')
    .addFields(
      { name: 'Amount', value: `\`${ltcAmount}\` LTC ($${usdAmount} USD)` },
      { name: 'Sender', value: '`Anonymous`', inline: true },
      { name: 'Receiver', value: '`Anonymous`', inline: true },
      { name: 'Transaction', value: `\`${shorten(tx.hash)}\`` },
    )
    .setFooter({ text: `${tx.confirmations} confirmation(s)` })
    .setTimestamp(tx.received ? new Date(tx.received) : new Date());

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('View Transaction')
      .setStyle(ButtonStyle.Link)
      .setURL(explorerUrl),
  );

  return { embeds: [embed], components: [row] };
}

function scheduleNext(channelId, delay = randomDelay()) {
  const feed = feeds.get(channelId);
  if (!feed) return;
  if (feed.timer) clearTimeout(feed.timer);
  feed.timer = setTimeout(() => runFeed(channelId), delay);
}

async function runFeed(channelId) {
  const feed = feeds.get(channelId);
  if (!feed) return;

  try {
    const channel = await feed.client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      console.error(`[txid feed:${channelId}] Channel is temporarily unavailable; retrying`);
      scheduleNext(channelId, ERROR_RETRY_MS);
      return;
    }

    const tx = await fetchRandomTransaction(feed.seen);
    feed.seen.add(tx.hash);
    if (feed.seen.size > 500) feed.seen.delete(feed.seen.values().next().value);
    await channel.send(transactionMessage(tx));
    scheduleNext(channelId);
  } catch (error) {
    console.error(`[txid feed:${channelId}] ${error.message}`);
    const filtered = error.message.includes('skipped') || error.message.includes('not confirmed');
    scheduleNext(channelId, filtered ? FILTER_RETRY_MS : ERROR_RETRY_MS);
  }
}

function startTxidFeed(channel, client) {
  if (feeds.has(channel.id)) return false;
  feeds.set(channel.id, { client, seen: new Set(), timer: null });
  scheduleNext(channel.id, 1_000);
  return true;
}

function stopTxidFeed(channelId) {
  const feed = feeds.get(channelId);
  if (!feed) return false;
  if (feed.timer) clearTimeout(feed.timer);
  feeds.delete(channelId);
  return true;
}

function isTxidFeedRunning(channelId) {
  return feeds.has(channelId);
}

module.exports = { startTxidFeed, stopTxidFeed, isTxidFeedRunning };
