const { EmbedBuilder } = require('discord.js');

const feeds = new Map();
const MIN_DELAY_MS = 60_000;
const MAX_DELAY_MS = 240_000;
const CHAIN_API_URL = 'https://api.blockcypher.com/v1/ltc/main';
const PRICE_API_URL = 'https://api.exchange.coinbase.com/products/LTC-USD/trades?limit=1';
const MAX_USD_VALUE = 2_500;
const HIGH_VALUE_THRESHOLD = 1_000;

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
  const pool = [...(candidates.length ? candidates : txids)].sort(() => Math.random() - 0.5);

  const eligible = [];
  for (const hash of pool.slice(0, 20)) {
    const tx = await requestJson(`${CHAIN_API_URL}/txs/${hash}`);
    const ltcValue = Number(tx.total || 0) / 100_000_000;
    const usdValue = ltcValue * ltcUsd;
    if (tx?.hash && Number(tx.confirmations || 0) >= 1 && usdValue <= MAX_USD_VALUE) {
      eligible.push({ ...tx, ltcUsd, usdValue });
    }
  }
  if (eligible.length) {
    const weighted = eligible.flatMap(tx => Array(tx.usdValue >= HIGH_VALUE_THRESHOLD ? 1 : 7).fill(tx));
    return weighted[Math.floor(Math.random() * weighted.length)];
  }
  throw new Error(`No confirmed transaction at or below $${MAX_USD_VALUE} was found`);
}

function transactionEmbed(tx) {
  const total = Array.isArray(tx.outputs)
    ? tx.outputs.reduce((sum, output) => sum + Number(output.value || 0), 0)
    : Number(tx.total || 0);

  return new EmbedBuilder()
    .setTitle('Live Litecoin Transaction')
    .setColor('#345D9D')
    .setDescription(`A confirmed public Litecoin transaction highlighted by the AutoMM feed.\n\n**TXID**\n\`${tx.hash}\``)
    .addFields(
      { name: 'Amount moved', value: `${litoshisToLtc(total)} LTC`, inline: true },
      { name: 'Estimated value', value: `$${tx.usdValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, inline: true },
      { name: 'Status', value: `Confirmed • ${tx.confirmations} confirmation(s)`, inline: true },
      { name: 'Explorer', value: `[View transaction](https://live.blockcypher.com/ltc/tx/${tx.hash}/)` },
    )
    .setFooter({ text: 'Public blockchain data • Not linked to a specific AutoMM trade' })
    .setTimestamp(tx.received ? new Date(tx.received) : new Date());
}

function scheduleNext(channelId) {
  const feed = feeds.get(channelId);
  if (!feed) return;
  feed.timer = setTimeout(() => runFeed(channelId), randomDelay());
}

async function runFeed(channelId) {
  const feed = feeds.get(channelId);
  if (!feed) return;

  try {
    const channel = await feed.client.channels.fetch(channelId).catch(() => null);
    if (!channel || !channel.isTextBased()) {
      stopTxidFeed(channelId);
      return;
    }

    const tx = await fetchRandomTransaction(feed.seen);
    feed.seen.add(tx.hash);
    if (feed.seen.size > 500) feed.seen.delete(feed.seen.values().next().value);
    await channel.send({ embeds: [transactionEmbed(tx)] });
  } catch (error) {
    console.error(`[txid feed:${channelId}] ${error.message}`);
  }

  scheduleNext(channelId);
}

function startTxidFeed(channel, client) {
  if (feeds.has(channel.id)) return false;
  feeds.set(channel.id, { client, seen: new Set(), timer: null });
  scheduleNext(channel.id);
  return true;
}

function stopTxidFeed(channelId) {
  const feed = feeds.get(channelId);
  if (!feed) return false;
  if (feed.timer) clearTimeout(feed.timer);
  feeds.delete(channelId);
  return true;
}

module.exports = { startTxidFeed, stopTxidFeed };
