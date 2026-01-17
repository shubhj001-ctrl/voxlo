# VOXLO Architecture - P2P Direct Messaging

## Overview
VOXLO is a **direct peer-to-peer encrypted chat** system similar to WhatsApp or Instagram DMs, NOT a chat room system.

## Connection Model

### User Flow
1. **User A** logs in → gets a unique **invite code** (6 alphanumeric)
2. **User B** uses User A's code → creates a **direct connection** 
3. Both users can now message each other in real-time
4. Connection persists until manually removed by either user

### What is a "Connection"?
A connection is stored as:
```javascript
{
  roomId: "user_123-user_456",  // Sorted user IDs
  partnerId: "user_456",         // The other person
  partnerName: "John Doe",       // Display name
  messages: [],                  // Last 10 minutes only
  createdAt: 1705500000000      // When connection established
}
```

## Data Persistence

### Client-Side (localStorage)
**Source of Truth for Connections:**
- Stores all active connections (your contact list)
- Stored as `voxlo_chats` in localStorage
- **Survives page refresh immediately**
- Contains user info + connection metadata

```javascript
// On page load - IMMEDIATELY restored
const savedChats = localStorage.getItem('voxlo_chats');
setChats(savedChats); // Shows connections instantly
```

### Server-Side (In-Memory + Disk)
**Temporary State:**
- Maintains active connections in `activeChats` Map
- Persists to `server/chats-data.json` on disk
- Loaded on server startup
- Used for real-time message routing

**Data Flow:**
```
App Refresh
    ↓
Load from localStorage → Connections show instantly
    ↓
Socket connects
    ↓
Register user
    ↓
Call getChats → Server sends persisted connections
    ↓
Rebuild server-side state
    ↓
Continue messaging
```

## Message Lifecycle

### During Active Chat (Both Users Online)
1. User A sends message
2. Message stored in-memory on server
3. Sent to User B in real-time via WebSocket
4. User B's client stores in localStorage
5. Both clients show isOwn flag for styling

### Auto-Expiry (10 Minutes)
- Messages auto-delete from server after 10 minutes
- Clients also auto-cleanup localStorage periodically
- **But connections ALWAYS persist** (no expiry)

### When User Offline
- Messages wait on server (up to 10 min)
- When user comes online, they receive pending messages
- Connection remains visible in friend list

## Socket Events

### Connection Events
| Event | Sender | Data | Purpose |
|-------|--------|------|---------|
| `register` | Client | userId, firstName, lastName | Login user |
| `getChats` | Client | userId | Restore connections |
| `connectWithCode` | Client | inviteCode, myUserId | Add new connection |
| `registered` | Server | User data + invite code | Confirm registration |
| `chatsLoaded` | Server | Array of connections | Restore all connections |
| `chatConnected` | Server | New connection data | New connection established |

### Message Events
| Event | Sender | Data | Purpose |
|-------|--------|------|---------|
| `sendMessage` | Client | roomId, message, timestamp | Send a message |
| `newMessage` | Server | Message data | Broadcast received message |

## Key Guarantees

### ✅ Connections Persist
- Stored in localStorage on client
- Stored in chats-data.json on server
- Survive page refresh
- Survive server restart
- Only removed when user manually disconnects

### ✅ Real-Time Messaging
- WebSocket connection for instant delivery
- Fallback to polling if WebSocket unavailable
- Automatic reconnection on network loss
- Message queuing during offline periods

### ✅ Data Privacy
- Messages encrypted end-to-end (TODO: implement)
- No unread message tracking (yet)
- Messages auto-delete after 10 minutes
- No server-side message history

## Technical Details

### Connection ID (roomId)
```javascript
// Always sorted for consistency
function getRoomId(userId1, userId2) {
  return [userId1, userId2].sort().join('-');
}
// Result: "user_100-user_200" or "user_200-user_100" → same!
```

### Socket.io Configuration
```javascript
{
  pingInterval: 25000,      // Keep-alive ping
  pingTimeout: 60000,       // Wait 60s before disconnect
  reconnection: true,       // Auto-reconnect
  reconnectionDelayMax: 5000, // Max 5s between attempts
  reconnectionAttempts: Infinity, // Keep trying
  transports: ['websocket', 'polling'] // Fallback
}
```

## Troubleshooting

### Connections Disappear After Refresh
**Check:**
1. Is localStorage being cleared? (Check DevTools → Application → Local Storage)
2. Are console logs showing connections being loaded?
3. Is the server receiving `getChats` call?

**Console Log Sequence Should Be:**
```
👤 Loaded user from localStorage: John Doe
👥 Loaded 2 direct connections from localStorage
📋 Connections: [Friend 1, Friend 2]
🔗 Connected to server
👤 Re-registering user: John Doe
📥 chatsLoaded from server: 2 chats
✅ Final merged connections: 2
```

### Messages Not Sending
**Check:**
1. Is socket connected? (`socket.connected`)
2. Is chatUsers registered? (Check server logs)
3. Is the roomId correct? (Should be sorted userId pair)

### One User Can't Connect to Another's Code
**Check:**
1. Is the invite code correct? (6 char alphanumeric)
2. Is the code expired? (Check users-data.json)
3. Are both users active? (Check status in admin panel)

## Future Enhancements

- [ ] End-to-end encryption (E2EE)
- [ ] Unread message counter
- [ ] Message read receipts
- [ ] Typing indicators (partial - needs UI update)
- [ ] Media sharing (images, files)
- [ ] Voice/video calls
- [ ] Message search
- [ ] Connection expiry notification
