# ICEMM Bot Privacy Policy

Last updated: October 11, 2026

ICEMM Bot provides Discord marketplace, ticket, reputation, role-management, and cryptocurrency middleman utilities.

## Data collected

The bot may process Discord user IDs, server IDs, channel IDs, role IDs, usernames, reputation ratings and feedback, ticket participant information, ticket status, pending member-management job progress, cryptocurrency payment addresses, amounts, and public blockchain transaction identifiers. It accesses server member lists only when needed for member-management features such as the administrator-only `/role` and `/rename` commands.

## How data is used

Data is used only to provide the requested bot features, manage tickets, display reputation, assign roles, and monitor payments associated with an active ticket. The bot does not sell personal data.

## Storage, security, and retention

Stored Discord-related records are encrypted at rest using AES-256-GCM. Reputation, payment-session, and pending member-management records are automatically removed no later than 30 days after their last update. Discord messages already posted in server channels remain subject to the server's and Discord's message-retention practices.

## Data deletion

Users can run `/deletedata confirm:true` to delete their stored reputation, payment-session, and pending member-management records. Users may also open a support ticket in the Discord server to request help with deletion.

## Third parties

Discord processes information according to its own privacy policy. Public Litecoin blockchain services may be queried to confirm payments; blockchain transactions are public and cannot be deleted by the bot.

## Changes

This policy may be updated when the bot's features or data practices change. The latest version is published in this repository.
