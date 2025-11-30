import { supabase } from "../utils/supabase.js";

export class AccountModal {
  constructor(game) {
    this.game = game;
    this.serverUrl = import.meta.env.VITE_SERVER_URL || "http://localhost:8080";
    this.isVisible = false;
    this.currentUser = null;

    this.createModal();
    this.checkAuthStatus();
    this.setupAuthStateListener();
  }

  async checkAuthStatus() {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      this.currentUser = session?.user || null;
      this.updateModalContent();
    } catch (error) {
      console.error("Error checking auth status:", error);
    }
  }

  setupAuthStateListener() {
    // Listen for auth state changes (OAuth callback, magic link, etc.)
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" && session) {
        this.currentUser = session.user;

        // Link player ID to the newly authenticated user
        await this.linkPlayerToUser();

        // Update modal content if visible
        if (this.isVisible) {
          this.updateModalContent();
        }
      } else if (event === "SIGNED_OUT") {
        this.currentUser = null;
        if (this.isVisible) {
          this.updateModalContent();
        }
      }
    });
  }

  createModal() {
    // Modal overlay
    const overlay = document.createElement("div");
    overlay.id = "account-modal-overlay";
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(10px);
      z-index: 10000;
      display: none;
      align-items: center;
      justify-content: center;
    `;

    // Modal container
    const modal = document.createElement("div");
    modal.id = "account-modal";
    modal.style.cssText = `
      background: linear-gradient(135deg, rgba(20, 20, 40, 0.95) 0%, rgba(0, 0, 0, 0.95) 100%);
      border: 2px solid rgba(100, 200, 255, 0.5);
      border-radius: 15px;
      padding: 30px;
      max-width: 450px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      font-family: 'Orbitron', monospace;
      color: white;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.8);
    `;

    // Header
    const header = document.createElement("div");
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 25px;
      border-bottom: 2px solid rgba(100, 200, 255, 0.3);
      padding-bottom: 15px;
    `;

    const title = document.createElement("h2");
    title.style.cssText = `
      margin: 0;
      font-size: 24px;
      color: #ffa500;
      text-shadow: 0 0 10px rgba(255, 165, 0, 0.5);
    `;
    title.textContent = "🏍️ Account";

    const closeBtn = document.createElement("button");
    closeBtn.style.cssText = `
      background: transparent;
      border: none;
      color: rgba(255, 255, 255, 0.6);
      font-size: 28px;
      cursor: pointer;
      transition: color 0.2s;
      padding: 0;
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    closeBtn.innerHTML = "×";
    closeBtn.onmouseover = () => (closeBtn.style.color = "#ff0000");
    closeBtn.onmouseout = () =>
      (closeBtn.style.color = "rgba(255, 255, 255, 0.6)");
    closeBtn.onclick = () => this.hide();

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Content area (will be populated based on auth status)
    const content = document.createElement("div");
    content.id = "account-modal-content";

    modal.appendChild(header);
    modal.appendChild(content);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Store references
    this.overlay = overlay;
    this.modal = modal;
    this.contentElement = content;

    // Close on overlay click - store handler reference for cleanup
    this.overlayClickHandler = (e) => {
      if (e.target === overlay) {
        this.hide();
      }
    };
    overlay.addEventListener("click", this.overlayClickHandler);
  }

  updateModalContent() {
    const content = this.contentElement;
    content.innerHTML = "";

    if (this.currentUser) {
      // User is logged in - show rename form
      this.renderRenameForm(content);
    } else {
      // User not logged in - show login/signup options
      this.renderAuthOptions(content);
    }
  }

  renderAuthOptions(container) {
    container.innerHTML = `
      <div style="text-align: center;">
        <p style="color: rgba(255, 255, 255, 0.8); margin-bottom: 25px; font-size: 14px;">
          Sign in to claim your account and customize your rider name
        </p>

        <!-- Google Sign In Button -->
        <button id="google-signin-btn" style="
          width: 100%;
          padding: 14px;
          background: white;
          border: none;
          border-radius: 8px;
          color: #333;
          font-family: 'Orbitron', monospace;
          font-size: 15px;
          font-weight: bold;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
          margin-bottom: 25px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        " onmouseover="this.style.transform='scale(1.02)'; this.style.boxShadow='0 4px 12px rgba(0, 0, 0, 0.4)'" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 2px 8px rgba(0, 0, 0, 0.3)'">
          <svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          Sign in with Google
        </button>

        <div style="
          display: flex;
          align-items: center;
          margin-bottom: 25px;
          color: rgba(255, 255, 255, 0.5);
        ">
          <div style="flex: 1; height: 1px; background: rgba(255, 255, 255, 0.2);"></div>
          <span style="padding: 0 15px; font-size: 12px;">OR</span>
          <div style="flex: 1; height: 1px; background: rgba(255, 255, 255, 0.2);"></div>
        </div>

        <div id="auth-tabs" style="display: flex; gap: 10px; margin-bottom: 25px; justify-content: center;">
          <button id="tab-email" class="auth-tab active" style="
            flex: 1;
            padding: 12px 20px;
            background: rgba(100, 200, 255, 0.3);
            border: 1px solid rgba(100, 200, 255, 0.5);
            color: white;
            cursor: pointer;
            border-radius: 8px;
            font-family: 'Orbitron', monospace;
            font-size: 13px;
            transition: all 0.2s;
          ">Magic Link</button>
          <button id="tab-login" class="auth-tab" style="
            flex: 1;
            padding: 12px 20px;
            background: rgba(100, 200, 255, 0.1);
            border: 1px solid rgba(100, 200, 255, 0.3);
            color: rgba(255, 255, 255, 0.6);
            cursor: pointer;
            border-radius: 8px;
            font-family: 'Orbitron', monospace;
            font-size: 13px;
            transition: all 0.2s;
          ">Login</button>
          <button id="tab-signup" class="auth-tab" style="
            flex: 1;
            padding: 12px 20px;
            background: rgba(100, 200, 255, 0.1);
            border: 1px solid rgba(100, 200, 255, 0.3);
            color: rgba(255, 255, 255, 0.6);
            cursor: pointer;
            border-radius: 8px;
            font-family: 'Orbitron', monospace;
            font-size: 13px;
            transition: all 0.2s;
          ">Sign Up</button>
        </div>

        <div id="auth-form-container"></div>

        <div id="auth-error" style="
          color: #ff4444;
          margin-top: 15px;
          font-size: 13px;
          display: none;
        "></div>

        <div id="auth-success" style="
          color: #00ff00;
          margin-top: 15px;
          font-size: 13px;
          display: none;
        "></div>
      </div>
    `;

    // Tab switching
    const emailTab = container.querySelector("#tab-email");
    const loginTab = container.querySelector("#tab-login");
    const signupTab = container.querySelector("#tab-signup");
    const formContainer = container.querySelector("#auth-form-container");
    const googleBtn = container.querySelector("#google-signin-btn");

    const switchTab = (tabType) => {
      // Reset all tabs
      const tabs = [emailTab, loginTab, signupTab];
      tabs.forEach((tab) => {
        tab.style.background = "rgba(100, 200, 255, 0.1)";
        tab.style.borderColor = "rgba(100, 200, 255, 0.3)";
        tab.style.color = "rgba(255, 255, 255, 0.6)";
      });

      // Activate selected tab
      const activeTab =
        tabType === "email"
          ? emailTab
          : tabType === "login"
          ? loginTab
          : signupTab;
      activeTab.style.background = "rgba(100, 200, 255, 0.3)";
      activeTab.style.borderColor = "rgba(100, 200, 255, 0.5)";
      activeTab.style.color = "white";

      // Render form
      if (tabType === "email") {
        this.renderMagicLinkForm(formContainer);
      } else if (tabType === "login") {
        this.renderLoginForm(formContainer);
      } else {
        this.renderSignupForm(formContainer);
      }
    };

    emailTab.onclick = () => switchTab("email");
    loginTab.onclick = () => switchTab("login");
    signupTab.onclick = () => switchTab("signup");
    googleBtn.onclick = () => this.handleGoogleSignIn();

    // Show magic link form by default
    switchTab("email");
  }

  renderLoginForm(container) {
    container.innerHTML = `
      <form id="login-form" style="display: flex; flex-direction: column; gap: 15px;">
        <div>
          <label style="display: block; margin-bottom: 5px; font-size: 13px; color: rgba(255, 255, 255, 0.8);">
            Email
          </label>
          <input type="email" id="login-email" required style="
            width: 100%;
            padding: 12px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(100, 200, 255, 0.3);
            border-radius: 8px;
            color: white;
            font-family: 'Orbitron', monospace;
            font-size: 14px;
            box-sizing: border-box;
          " />
        </div>

        <div>
          <label style="display: block; margin-bottom: 5px; font-size: 13px; color: rgba(255, 255, 255, 0.8);">
            Password
          </label>
          <input type="password" id="login-password" required style="
            width: 100%;
            padding: 12px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(100, 200, 255, 0.3);
            border-radius: 8px;
            color: white;
            font-family: 'Orbitron', monospace;
            font-size: 14px;
            box-sizing: border-box;
          " />
        </div>

        <button type="submit" style="
          padding: 14px;
          background: linear-gradient(135deg, #ffa500 0%, #ff8800 100%);
          border: none;
          border-radius: 8px;
          color: white;
          font-family: 'Orbitron', monospace;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          transition: transform 0.2s;
          margin-top: 10px;
        " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
          Login
        </button>
      </form>
    `;

    const form = container.querySelector("#login-form");
    form.onsubmit = (e) => this.handleLogin(e);
  }

  renderSignupForm(container) {
    container.innerHTML = `
      <form id="signup-form" style="display: flex; flex-direction: column; gap: 15px;">
        <div>
          <label style="display: block; margin-bottom: 5px; font-size: 13px; color: rgba(255, 255, 255, 0.8);">
            Email
          </label>
          <input type="email" id="signup-email" required style="
            width: 100%;
            padding: 12px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(100, 200, 255, 0.3);
            border-radius: 8px;
            color: white;
            font-family: 'Orbitron', monospace;
            font-size: 14px;
            box-sizing: border-box;
          " />
        </div>

        <div>
          <label style="display: block; margin-bottom: 5px; font-size: 13px; color: rgba(255, 255, 255, 0.8);">
            Password
          </label>
          <input type="password" id="signup-password" required minlength="6" style="
            width: 100%;
            padding: 12px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(100, 200, 255, 0.3);
            border-radius: 8px;
            color: white;
            font-family: 'Orbitron', monospace;
            font-size: 14px;
            box-sizing: border-box;
          " />
          <small style="color: rgba(255, 255, 255, 0.5); font-size: 11px; margin-top: 3px; display: block;">
            Minimum 6 characters
          </small>
        </div>

        <button type="submit" style="
          padding: 14px;
          background: linear-gradient(135deg, #00ff00 0%, #00cc00 100%);
          border: none;
          border-radius: 8px;
          color: black;
          font-family: 'Orbitron', monospace;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          transition: transform 0.2s;
          margin-top: 10px;
        " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
          Create Account
        </button>
      </form>
    `;

    const form = container.querySelector("#signup-form");
    form.onsubmit = (e) => this.handleSignup(e);
  }

  renderMagicLinkForm(container) {
    container.innerHTML = `
      <form id="magic-link-form" style="display: flex; flex-direction: column; gap: 15px;">
        <div>
          <label style="display: block; margin-bottom: 5px; font-size: 13px; color: rgba(255, 255, 255, 0.8);">
            Email Address
          </label>
          <input type="email" id="magic-link-email" required style="
            width: 100%;
            padding: 12px;
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(100, 200, 255, 0.3);
            border-radius: 8px;
            color: white;
            font-family: 'Orbitron', monospace;
            font-size: 14px;
            box-sizing: border-box;
          " placeholder="rider@example.com" />
          <small style="color: rgba(255, 255, 255, 0.5); font-size: 11px; margin-top: 5px; display: block;">
            We'll send you a magic link to sign in
          </small>
        </div>

        <button type="submit" style="
          padding: 14px;
          background: linear-gradient(135deg, #9c27b0 0%, #7b1fa2 100%);
          border: none;
          border-radius: 8px;
          color: white;
          font-family: 'Orbitron', monospace;
          font-size: 16px;
          font-weight: bold;
          cursor: pointer;
          transition: transform 0.2s;
          margin-top: 10px;
        " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
          Send Magic Link
        </button>
      </form>
    `;

    const form = container.querySelector("#magic-link-form");
    form.onsubmit = (e) => this.handleMagicLink(e);
  }

  renderRenameForm(container) {
    const currentUsername =
      this.game.multiplayerManager?.username ||
      localStorage.getItem("motosai_username") ||
      "Unknown";

    container.innerHTML = `
      <div>
        <p style="color: rgba(255, 255, 255, 0.8); margin-bottom: 10px; font-size: 14px;">
          Logged in as: <strong style="color: #00ff00;">${this.currentUser.email}</strong>
        </p>

        <div style="
          background: rgba(100, 200, 255, 0.1);
          border: 1px solid rgba(100, 200, 255, 0.3);
          border-radius: 10px;
          padding: 20px;
          margin: 25px 0;
        ">
          <p style="color: rgba(255, 255, 255, 0.7); margin-bottom: 15px; font-size: 13px;">
            Current rider name:
          </p>
          <p style="color: #ffa500; font-size: 20px; font-weight: bold; margin: 0 0 20px 0;">
            ${currentUsername}
          </p>

          <form id="rename-form" style="display: flex; flex-direction: column; gap: 15px;">
            <div>
              <label style="display: block; margin-bottom: 5px; font-size: 13px; color: rgba(255, 255, 255, 0.8);">
                New Rider Name
              </label>
              <input type="text" id="new-username" required minlength="3" maxlength="20" style="
                width: 100%;
                padding: 12px;
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(100, 200, 255, 0.3);
                border-radius: 8px;
                color: white;
                font-family: 'Orbitron', monospace;
                font-size: 14px;
                box-sizing: border-box;
              " placeholder="${currentUsername}" />
              <small style="color: rgba(255, 255, 255, 0.5); font-size: 11px; margin-top: 3px; display: block;">
                3-20 characters, letters, numbers, and underscores only
              </small>
            </div>

            <button type="submit" style="
              padding: 14px;
              background: linear-gradient(135deg, #ffa500 0%, #ff8800 100%);
              border: none;
              border-radius: 8px;
              color: white;
              font-family: 'Orbitron', monospace;
              font-size: 16px;
              font-weight: bold;
              cursor: pointer;
              transition: transform 0.2s;
            " onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
              Update Name
            </button>
          </form>
        </div>

        <button id="logout-btn" style="
          width: 100%;
          padding: 12px;
          background: rgba(255, 0, 0, 0.2);
          border: 1px solid rgba(255, 0, 0, 0.5);
          border-radius: 8px;
          color: #ff4444;
          font-family: 'Orbitron', monospace;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s;
        " onmouseover="this.style.background='rgba(255, 0, 0, 0.3)'" onmouseout="this.style.background='rgba(255, 0, 0, 0.2)'">
          Logout
        </button>

        <div id="rename-error" style="
          color: #ff4444;
          margin-top: 15px;
          font-size: 13px;
          display: none;
        "></div>

        <div id="rename-success" style="
          color: #00ff00;
          margin-top: 15px;
          font-size: 13px;
          display: none;
        "></div>
      </div>
    `;

    const form = container.querySelector("#rename-form");
    const logoutBtn = container.querySelector("#logout-btn");

    form.onsubmit = (e) => this.handleRename(e);
    logoutBtn.onclick = () => this.handleLogout();
  }

  async handleLogin(e) {
    e.preventDefault();

    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    const errorDiv = document.getElementById("auth-error");
    const successDiv = document.getElementById("auth-success");

    errorDiv.style.display = "none";
    successDiv.style.display = "none";

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      this.currentUser = data.user;
      successDiv.textContent = "Login successful!";
      successDiv.style.display = "block";

      // Link player ID to Supabase user
      await this.linkPlayerToUser();

      // Update modal to show rename form
      setTimeout(() => {
        this.updateModalContent();
      }, 1000);
    } catch (error) {
      console.error("Login error:", error);
      errorDiv.textContent = error.message || "Login failed";
      errorDiv.style.display = "block";
    }
  }

  async handleSignup(e) {
    e.preventDefault();

    const email = document.getElementById("signup-email").value;
    const password = document.getElementById("signup-password").value;
    const errorDiv = document.getElementById("auth-error");
    const successDiv = document.getElementById("auth-success");

    errorDiv.style.display = "none";
    successDiv.style.display = "none";

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        successDiv.textContent =
          "Account created! Please check your email to verify.";
        successDiv.style.display = "block";

        // If email confirmation is disabled, update current user and link
        if (data.session) {
          this.currentUser = data.user;
          await this.linkPlayerToUser();

          setTimeout(() => {
            this.updateModalContent();
          }, 2000);
        }
      }
    } catch (error) {
      console.error("Signup error:", error);
      errorDiv.textContent = error.message || "Signup failed";
      errorDiv.style.display = "block";
    }
  }

  async handleGoogleSignIn() {
    const errorDiv = document.getElementById("auth-error");
    const successDiv = document.getElementById("auth-success");

    errorDiv.style.display = "none";
    successDiv.style.display = "none";

    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
        },
      });

      if (error) throw error;

      // User will be redirected to Google for authentication
      // After successful auth, they'll be redirected back and session will be established
    } catch (error) {
      console.error("Google sign-in error:", error);
      errorDiv.textContent = error.message || "Google sign-in failed";
      errorDiv.style.display = "block";
    }
  }

  async handleMagicLink(e) {
    e.preventDefault();

    const email = document.getElementById("magic-link-email").value;
    const errorDiv = document.getElementById("auth-error");
    const successDiv = document.getElementById("auth-success");

    errorDiv.style.display = "none";
    successDiv.style.display = "none";

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });

      if (error) throw error;

      successDiv.textContent = "Magic link sent! Check your email to sign in.";
      successDiv.style.display = "block";
    } catch (error) {
      console.error("Magic link error:", error);
      errorDiv.textContent = error.message || "Failed to send magic link";
      errorDiv.style.display = "block";
    }
  }

  async handleRename(e) {
    e.preventDefault();

    const newUsername = document.getElementById("new-username").value.trim();
    const errorDiv = document.getElementById("rename-error");
    const successDiv = document.getElementById("rename-success");

    errorDiv.style.display = "none";
    successDiv.style.display = "none";

    // Validate username
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(newUsername)) {
      errorDiv.textContent = "Invalid username format";
      errorDiv.style.display = "block";
      return;
    }

    try {
      const playerId = localStorage.getItem("motosai_player_id");
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const response = await fetch(`${this.serverUrl}/api/account/rename`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          playerId,
          newUsername,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || "Failed to rename account");
      }

      // Update local storage
      localStorage.setItem("motosai_username", newUsername);

      // Update multiplayer manager
      if (this.game.multiplayerManager) {
        this.game.multiplayerManager.username = newUsername;
      }

      successDiv.textContent = `Successfully renamed to ${newUsername}!`;
      successDiv.style.display = "block";

      // Refresh leaderboard if it exists
      if (this.game.leaderboardUI) {
        this.game.leaderboardUI.fetchLeaderboard();
      }

      // Update the display
      setTimeout(() => {
        this.updateModalContent();
      }, 2000);
    } catch (error) {
      console.error("Rename error:", error);
      errorDiv.textContent = error.message || "Failed to rename account";
      errorDiv.style.display = "block";
    }
  }

  async handleLogout() {
    try {
      await supabase.auth.signOut();
      this.currentUser = null;
      this.updateModalContent();
    } catch (error) {
      console.error("Logout error:", error);
    }
  }

  async linkPlayerToUser() {
    try {
      const playerId = localStorage.getItem("motosai_player_id");
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!playerId || !session) return;

      await fetch(`${this.serverUrl}/api/account/link`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          playerId,
          userId: session.user.id,
        }),
      });
    } catch (error) {
      console.error("Error linking player to user:", error);
    }
  }

  show() {
    this.isVisible = true;
    this.overlay.style.display = "flex";
    this.checkAuthStatus();
  }

  hide() {
    this.isVisible = false;
    this.overlay.style.display = "none";
  }

  dispose() {
    // Remove event listener
    if (this.overlay && this.overlayClickHandler) {
      this.overlay.removeEventListener("click", this.overlayClickHandler);
      this.overlayClickHandler = null;
    }

    // Remove DOM elements
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }

    // Clear references
    this.modal = null;
    this.contentElement = null;
    this.currentUser = null;
    this.game = null;
  }
}
