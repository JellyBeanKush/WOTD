
type CommandCallback = (message: string, username: string) => void;
type StatusCallback = (status: 'CONNECTED' | 'DISCONNECTED' | 'CONNECTING', error?: string) => void;
type LogCallback = (msg: string) => void;

interface TwitchConfig {
  channel: string;
  username?: string;
  token?: string;
}

export class TwitchChatListener {
  private ws: WebSocket | null = null;
  private config: TwitchConfig;
  private callback: CommandCallback | null = null;
  private onStatusChange: StatusCallback | null = null;
  private onLog: LogCallback | null = null;
  private keepAliveInterval: number | null = null;
  private reconnectTimeout: number | null = null;
  private isIntentionalDisconnect = false;

  constructor(config: TwitchConfig, callback: CommandCallback, onStatusChange?: StatusCallback, onLog?: LogCallback) {
    // Clean token
    let cleanToken = config.token?.trim();
    if (cleanToken?.startsWith('oauth:')) {
        cleanToken = cleanToken.substring(6);
    }

    this.config = {
        ...config,
        channel: config.channel.toLowerCase().replace('#', '').trim(),
        username: config.username?.toLowerCase().trim(),
        token: cleanToken ? `oauth:${cleanToken}` : undefined
    };
    this.callback = callback;
    this.onStatusChange = onStatusChange || null;
    this.onLog = onLog || null;
    this.connect();
  }

  private log(msg: string) {
      console.log(`[Twitch] ${msg}`);
      if (this.onLog) this.onLog(msg);
  }

  // NEW: Method to send messages to chat
  public send(text: string) {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          this.log('Cannot send: Socket not open.');
          return;
      }
      
      if (!this.config.token) {
          this.log('Cannot send: No OAuth Token provided (Read-Only Mode).');
          return;
      }

      // Twitch IRC limit is ~500 chars, but let's keep it safe
      const safeText = text.substring(0, 450); 
      this.ws.send(`PRIVMSG #${this.config.channel} :${safeText}`);
      this.log(`Sent: ${safeText}`);
  }

  public get isReadOnly(): boolean {
      return !this.config.token;
  }

  private connect() {
    this.isIntentionalDisconnect = false;
    if (this.ws) {
        this.log('Closing existing socket before reconnecting...');
        this.ws.close();
    }
    
    if (this.onStatusChange) this.onStatusChange('CONNECTING');
    this.log(`Attempting connection to #${this.config.channel}...`);

    try {
        this.ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
    } catch (e: any) {
        this.log(`WebSocket creation failed: ${e.message}`);
        if (this.onStatusChange) this.onStatusChange('DISCONNECTED', 'Socket Error');
        return;
    }

    this.ws.onopen = () => {
      this.log('Socket Opened. Sending Authentication...');
      
      if (this.config.token && this.config.username) {
        this.log(`Logging in as ${this.config.username}`);
        this.ws?.send(`PASS ${this.config.token}`);
        this.ws?.send(`NICK ${this.config.username}`);
      } else {
        this.log('Logging in Anonymously (Read-Only)');
        this.ws?.send(`PASS SCHMOOPIIE`);
        this.ws?.send(`NICK justinfan${Math.floor(Math.random() * 99999)}`);
      }

      this.ws?.send(`JOIN #${this.config.channel}`);
      
      if (this.onStatusChange) this.onStatusChange('CONNECTED');

      // Ping every 4 minutes
      this.keepAliveInterval = window.setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send('PING');
            this.log('Sent PING');
        }
      }, 240000);
    };

    this.ws.onmessage = (event) => {
      const data = event.data.toString();
      
      if (data.startsWith('PING')) {
        this.ws?.send('PONG :tmi.twitch.tv');
        return;
      }

      // Log raw auth errors
      if (data.includes('NOTICE') && (data.includes('failed') || data.includes('unsuccessful'))) {
          this.log(`Server NOTICE: ${data}`);
      }

      // Handle Authentication Failure
      if (data.includes('Login authentication failed') || data.includes('Improperly formatted auth')) {
          this.log('CRITICAL: Authentication Failed. Disconnecting.');
          this.disconnect();
          if (this.onStatusChange) this.onStatusChange('DISCONNECTED', 'Auth Failed');
          return;
      }
      
      // Confirm Join
      if (data.includes(`JOIN #${this.config.channel}`)) {
          this.log(`Successfully joined #${this.config.channel}`);
      }

      if (data.includes('PRIVMSG')) {
        this.parsePrivMsg(data);
      }
    };

    this.ws.onclose = (event) => {
      if (this.isIntentionalDisconnect) {
          this.log('Disconnected cleanly (User initiated).');
          return;
      }

      this.log(`Socket closed (Code: ${event.code}). Reconnecting in 5s...`);
      if (this.onStatusChange) this.onStatusChange('DISCONNECTED', 'Reconnecting...');
      
      if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
      this.reconnectTimeout = window.setTimeout(() => this.connect(), 5000);
    };
    
    this.ws.onerror = (err) => {
        this.log(`WebSocket Error detected.`);
        if (this.onStatusChange) this.onStatusChange('DISCONNECTED', 'Network Error');
    };
  }

  private parsePrivMsg(rawLine: string) {
    try {
        const channelMarker = `#${this.config.channel} :`;
        const msgIndex = rawLine.indexOf(channelMarker);
        
        if (msgIndex === -1) return;

        const message = rawLine.substring(msgIndex + channelMarker.length).trim();
        
        const firstSpace = rawLine.indexOf(' ');
        const prefix = rawLine.substring(0, firstSpace);
        
        let source = prefix;
        if (rawLine.startsWith('@')) {
             const tagEnd = rawLine.indexOf(' :');
             if (tagEnd !== -1) {
                 const sourceEnd = rawLine.indexOf(' ', tagEnd + 2);
                 source = rawLine.substring(tagEnd + 2, sourceEnd);
             }
        } else {
             if (source.startsWith(':')) source = source.substring(1);
        }

        const nickEnd = source.indexOf('!');
        const username = nickEnd !== -1 ? source.substring(0, nickEnd) : source;

        if (this.callback) {
            this.callback(message, username);
        }

    } catch (e) {
        console.error('[Twitch] Parse error', e);
    }
  }

  public disconnect() {
    this.isIntentionalDisconnect = true;
    if (this.keepAliveInterval) clearInterval(this.keepAliveInterval);
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    if (this.onStatusChange) this.onStatusChange('DISCONNECTED');
  }
}
