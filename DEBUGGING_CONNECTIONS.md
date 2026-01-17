# Debugging Guide: Connection Persistence Issues

## The Real Issue
Connections were disappearing after page refresh because:
1. Server was NOT storing `createdAt` timestamp in the active chats data
2. Client had enhanced logging but no way to verify localStorage was working
3. No comprehensive debugging tool to inspect the full state

## What Was Fixed
✅ Server now stores `createdAt` with each connection  
✅ Client now verifies localStorage writes immediately after saving  
✅ Added `window.debugVoxloStorage()` function for inspection  
✅ Both server and client now log every save/load operation  

## How to Debug

### 1. Open Browser Developer Tools
- Press `F12` or `Ctrl+Shift+I`
- Go to **Console** tab
- Go to **Application** → **Storage** → **Local Storage**

### 2. Test localStorage Directly
In the browser console, run:
```javascript
debugVoxloStorage()
```

You should see output like:
```
====== VOXLO STORAGE DEBUG ======
🔍 localStorage keys:
  - voxlo_connections: 256 bytes, 2 items
  - voxlo_messages: 512 bytes
  - voxlo_user: EXISTS

📋 Connections saved:
   • user_100-user_200: Alice Smith (created: 1/15/2024, 10:30:45 AM)
   • user_100-user_300: Bob Jones (created: 1/15/2024, 10:35:12 AM)

✅ Debug complete - check above for data
```

### 3. Watch the Console Logs

**On Connect:**
```
🔗 Connected to server
👤 Re-registering user: Alice Smith
📤 Rebuilding connections on server
```

**When Creating Connection:**
```
📝 NEW CHAT CREATED: user_100-user_200, saving to disk...
💾 Saved 1 connections to disk (chats-data.json)
   ✅ user_100-user_200: created 1/15/2024 10:30:45 AM, 0 messages
```

**When Receiving Chat Connection:**
```
✅ LOADED 2 direct connections metadata from localStorage
📋 Connection details: [
  {roomId: "user_100-user_200", partner: "Alice Smith", userId: "user_100", createdAt: "1/15/2024, 10:30:45 AM"},
  {roomId: "user_100-user_300", partner: "Bob Jones", userId: "user_100", createdAt: "1/15/2024, 10:35:12 AM"}
]
```

**When Saving to localStorage:**
```
💾 SAVED voxlo_connections: 2 connections
   Details: user_100-user_200 (Alice Smith), user_100-user_300 (Bob Jones)
✅ VERIFIED voxlo_connections saved to localStorage, count: 2
```

### 4. Test the Full Lifecycle

**Steps:**
1. Login with user1@test.com (password: jaggibaba)
2. Open Developer Tools Console
3. Run: `debugVoxloStorage()`
   - Should show: 0 connections initially
4. Create a connection with an invite code
5. Run: `debugVoxloStorage()` again
   - Should show: 1 connection saved
6. Refresh the page with F5
7. Run: `debugVoxloStorage()` again
   - Should show: 1 connection STILL there (this was the bug!)

### 5. Check Server Logs

In the terminal where server is running:

**On Server Start:**
```
🚀 Server running on port 3001
📂 Found chats-data.json with 5 entries
  ✅ Restored: user_100-user_200, created 1/15/2024 10:30:45 AM, 0 recent messages
  ✅ Restored: user_100-user_300, created 1/15/2024 10:35:12 AM, 2 recent messages
✅ Loaded 5 connections from persistent storage
```

**When User Connects:**
```
🔗 Connection received - Socket ID: abc123def456
👤 User registered: user_100 (Alice Smith)
📤 Rebuilding connections on server
```

**When Creating New Connection:**
```
📝 NEW CHAT CREATED: user_100-user_200, saving to disk...
💾 Saved 2 connections to disk (chats-data.json)
   ✅ user_100-user_200: created 1/15/2024 10:30:45 AM, 0 messages
   ✅ user_100-user_300: created 1/15/2024 10:35:12 AM, 2 messages
```

## If Connections Are Still Disappearing

### Check These:
1. **localStorage is working?**
   - In console: `localStorage.setItem('test', 'data'); localStorage.getItem('test')`
   - Should return: `"data"`

2. **Is voxlo_connections being saved?**
   - In Storage panel, look for `voxlo_connections` key
   - Click it and see the JSON content
   - Should have array of connection objects with roomId, partnerName, userId, createdAt

3. **Are connections being loaded on refresh?**
   - After refresh, immediately open console
   - Look for: "✅ LOADED X direct connections metadata from localStorage"
   - If you see "⚠️ voxlo_connections NOT FOUND" - THIS IS THE PROBLEM

4. **Is server persisting to chats-data.json?**
   - Stop server (Ctrl+C)
   - Check file: `server/chats-data.json`
   - Should contain all connections with createdAt timestamps
   - If empty or not there - server is not saving

## Solution Checklist

If connections still disappear:

- [ ] Run `debugVoxloStorage()` immediately after creating a connection (should show connection)
- [ ] Refresh the page
- [ ] Run `debugVoxloStorage()` again (should STILL show connection)
- [ ] If it's gone, check browser console for any errors
- [ ] Check Storage tab → Application → Local Storage
- [ ] Look for any "Error" messages in console during refresh
- [ ] Check if browser is in private/incognito mode (localStorage doesn't persist there!)
- [ ] Check browser extensions that might clear data
- [ ] Restart server and check server logs

## Console Output Format Reference

**Save Operation:**
```
💾 SAVED voxlo_connections: X connections
   Details: [list of roomIds with partner names]
✅ VERIFIED voxlo_connections saved to localStorage, count: X
```

**Load Operation:**
```
✅ LOADED X direct connections metadata from localStorage
📋 Connection details: [list with timestamps]
```

**New Connection:**
```
➕ Adding new connection: [partner name]
💾 INITIAL LOAD: Saved X connections metadata to localStorage
```

**Message Auto-cleanup:**
```
♻️ Auto-cleanup running, checking for expired messages
💾 SAVED voxlo_messages with X rooms having messages
```

## If Still Not Working

Get the complete console output from:
1. Server start
2. User login
3. Create connection (wait for all logs)
4. Page refresh (wait for all logs)

And provide to developer for analysis.
