// How a logged-in browser tab connects to the real-time server.
//
// The server decides which workspace and user a socket belongs to from the
// login token, not from anything the browser claims, so every authenticated
// connection must send it. (Same token the REST client already sends.)

export function getSocketUrl() {
  let socketUrl = import.meta.env.VITE_SOCKET_URL;
  if (!socketUrl) {
    const apiUrl = import.meta.env.VITE_API_URL || '';
    // undefined lets socket.io use the current origin (and the Vite proxy in dev)
    socketUrl = apiUrl.startsWith('http') ? apiUrl.replace('/api/v1', '') : undefined;
  }
  return socketUrl;
}

export function socketAuth() {
  let token;
  try {
    token = localStorage.getItem('auth_token') || undefined;
  } catch {
    token = undefined; // storage blocked: the httpOnly cookie is still sent with the handshake
  }
  return { token };
}
