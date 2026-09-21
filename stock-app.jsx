import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Search, Plus, LogOut, User, Mail, Lock, X, Upload, Link as LinkIcon,
  Eye, EyeOff, Check, AlertCircle, Package, Trash2, Pencil, ArrowLeft,
  ShieldCheck, Sparkles, Tag, Hash, ChevronDown,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Design tokens (see inline <style> below for full system)           */
/* ------------------------------------------------------------------ */

const DEFAULT_CATEGORIES = [
  "Electronics", "Furniture", "Apparel", "Collectibles", "Vehicles", "Tools", "Books", "Other",
];

const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

async function hashPassword(password) {
  const enc = new TextEncoder().encode("cache-salt-v1::" + password);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function genId() {
  return "itm_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 900;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round(height * (maxDim / width));
            width = maxDim;
          } else {
            width = Math.round(width * (maxDim / height));
            height = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.75));
      };
      img.onerror = () => reject(new Error("Could not read image"));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function formatPrice(n) {
  const num = Number(n) || 0;
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function safeGet(key, shared) {
  try {
    const res = await window.storage.get(key, shared);
    return res ? res.value : null;
  } catch {
    return null;
  }
}

async function safeSet(key, value, shared) {
  try {
    await window.storage.set(key, JSON.stringify(value), shared);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Root App                                                            */
/* ------------------------------------------------------------------ */

export default function App() {
  const [booting, setBooting] = useState(true);
  const [users, setUsers] = useState({});
  const [items, setItems] = useState([]);
  const [session, setSession] = useState(null); // { email, username }
  const [screen, setScreen] = useState("login"); // login | register | verify | app
  const [pendingEmail, setPendingEmail] = useState(null);
  const [banner, setBanner] = useState(null); // { type: 'error'|'success', text }

  useEffect(() => {
    (async () => {
      const [u, it, s] = await Promise.all([
        safeGet("users", true),
        safeGet("items", true),
        safeGet("session", false),
      ]);
      if (u) { try { setUsers(JSON.parse(u)); } catch {} }
      if (it) { try { setItems(JSON.parse(it)); } catch {} }
      if (s) {
        try {
          const parsed = JSON.parse(s);
          const freshUsers = u ? JSON.parse(u) : {};
          if (parsed?.email && freshUsers[parsed.email]?.verified) {
            setSession({ email: parsed.email, username: freshUsers[parsed.email].username });
            setScreen("app");
          }
        } catch {}
      }
      setBooting(false);
    })();
  }, []);

  const flash = useCallback((type, text) => {
    setBanner({ type, text });
    window.clearTimeout(flash._t);
    flash._t = window.setTimeout(() => setBanner(null), 4200);
  }, []);

  const persistUsers = async (next) => {
    setUsers(next);
    await safeSet("users", next, true);
  };
  const persistItems = async (next) => {
    setItems(next);
    await safeSet("items", next, true);
  };

  async function handleRegister({ email, username, password }) {
    email = email.trim().toLowerCase();
    username = username.trim();
    if (!emailRx.test(email)) return flash("error", "Enter a valid email address.");
    if (username.length < 3) return flash("error", "Username needs at least 3 characters.");
    if (password.length < 6) return flash("error", "Password needs at least 6 characters.");
    if (users[email]) return flash("error", "That email is already registered.");
    const usernameTaken = Object.values(users).some(
      (u) => u.username.toLowerCase() === username.toLowerCase()
    );
    if (usernameTaken) return flash("error", "That username is taken.");

    const passwordHash = await hashPassword(password);
    const code = genCode();
    const next = {
      ...users,
      [email]: { email, username, passwordHash, verified: false, code, createdAt: Date.now() },
    };
    await persistUsers(next);
    setPendingEmail(email);
    setScreen("verify");
  }

  async function handleLogin({ email, password }) {
    email = email.trim().toLowerCase();
    const u = users[email];
    if (!u) return flash("error", "No account found with that email.");
    const hash = await hashPassword(password);
    if (hash !== u.passwordHash) return flash("error", "Incorrect password.");
    if (!u.verified) {
      setPendingEmail(email);
      setScreen("verify");
      return flash("error", "Please verify your email to continue.");
    }
    setSession({ email: u.email, username: u.username });
    await safeSet("session", { email: u.email }, false);
    setScreen("app");
  }

  async function handleVerify(code) {
    const u = users[pendingEmail];
    if (!u) return flash("error", "Something went wrong. Please register again.");
    if (code.trim() !== u.code) return flash("error", "That code doesn't match.");
    const next = { ...users, [pendingEmail]: { ...u, verified: true } };
    await persistUsers(next);
    setSession({ email: u.email, username: u.username });
    await safeSet("session", { email: u.email }, false);
    setScreen("app");
    flash("success", "Email verified. Welcome to STOCK.");
  }

  async function handleResendCode() {
    const u = users[pendingEmail];
    if (!u) return;
    const code = genCode();
    const next = { ...users, [pendingEmail]: { ...u, code } };
    await persistUsers(next);
    flash("success", "New code generated below.");
  }

  async function handleLogout() {
    setSession(null);
    setScreen("login");
    await safeSet("session", { email: null }, false);
  }

  async function handleSaveItem(item) {
    if (item.id) {
      const next = items.map((it) => (it.id === item.id ? { ...it, ...item } : it));
      await persistItems(next);
      flash("success", "Listing updated.");
    } else {
      const newItem = {
        ...item,
        id: genId(),
        ownerEmail: session.email,
        ownerUsername: session.username,
        createdAt: Date.now(),
      };
      await persistItems([newItem, ...items]);
      flash("success", "Listing published.");
    }
  }

  async function handleDeleteItem(id) {
    await persistItems(items.filter((it) => it.id !== id));
    flash("success", "Listing removed.");
  }

  if (booting) {
    return (
      <Shell>
        <div className="c-boot">
          <div className="c-boot-mark">STOCK</div>
          <div className="c-boot-bar"><div className="c-boot-fill" /></div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {banner && (
        <div className={`c-banner c-banner--${banner.type}`}>
          {banner.type === "error" ? <AlertCircle size={15} /> : <Check size={15} />}
          <span>{banner.text}</span>
        </div>
      )}

      {screen === "login" && (
        <AuthScreen
          mode="login"
          onSwitch={() => setScreen("register")}
          onSubmit={handleLogin}
        />
      )}
      {screen === "register" && (
        <AuthScreen
          mode="register"
          onSwitch={() => setScreen("login")}
          onSubmit={handleRegister}
        />
      )}
      {screen === "verify" && (
        <VerifyScreen
          email={pendingEmail}
          code={users[pendingEmail]?.code}
          onVerify={handleVerify}
          onResend={handleResendCode}
          onBack={() => setScreen("login")}
        />
      )}
      {screen === "app" && session && (
        <MainApp
          session={session}
          items={items}
          onLogout={handleLogout}
          onSaveItem={handleSaveItem}
          onDeleteItem={handleDeleteItem}
        />
      )}
    </Shell>
  );
}

/* ------------------------------------------------------------------ */
/* Shell + shared visual chrome                                        */
/* ------------------------------------------------------------------ */

function Shell({ children }) {
  return (
    <div className="c-root">
      <style>{CSS}</style>
      <div className="c-grid-bg" />
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Auth screen (login / register)                                      */
/* ------------------------------------------------------------------ */

function AuthScreen({ mode, onSwitch, onSubmit }) {
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const isRegister = mode === "register";

  const submit = async () => {
    if (isRegister && password !== confirm) return;
    setBusy(true);
    await onSubmit(isRegister ? { email, username, password } : { email, password });
    setBusy(false);
  };

  const onKey = (e) => { if (e.key === "Enter") submit(); };

  return (
    <div className="c-auth">
      <div className="c-auth-brand">
        <div className="c-brand-mark">
          <Sparkles size={18} />
          <span>STOCK</span>
        </div>
        <h1 className="c-auth-headline">
          Trade what you have.<br />Discover what you need.
        </h1>
        <p className="c-auth-sub">
          A shared inventory exchange. List an item in seconds &mdash; anyone on STOCK
          can browse it, and you can browse everyone else's.
        </p>
        <ul className="c-auth-features">
          <li><Tag size={14} /> Publish items with photos, price &amp; quantity</li>
          <li><Package size={14} /> Organize listings into categories</li>
          <li><ShieldCheck size={14} /> Verified accounts, public marketplace</li>
        </ul>
      </div>

      <div className="c-auth-panel">
        <div className="c-card c-auth-card">
          <div className="c-tabbtns">
            <button
              className={`c-tabbtn ${mode === "login" ? "is-active" : ""}`}
              onClick={() => mode !== "login" && onSwitch()}
            >
              Sign in
            </button>
            <button
              className={`c-tabbtn ${mode === "register" ? "is-active" : ""}`}
              onClick={() => mode !== "register" && onSwitch()}
            >
              Create account
            </button>
          </div>

          <div className="c-field">
            <label>Email</label>
            <div className="c-input-wrap">
              <Mail size={15} className="c-input-icon" />
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={onKey}
              />
            </div>
          </div>

          {isRegister && (
            <div className="c-field">
              <label>Username</label>
              <div className="c-input-wrap">
                <User size={15} className="c-input-icon" />
                <input
                  type="text"
                  placeholder="yourname"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={onKey}
                />
              </div>
            </div>
          )}

          <div className="c-field">
            <label>Password</label>
            <div className="c-input-wrap">
              <Lock size={15} className="c-input-icon" />
              <input
                type={showPw ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={onKey}
              />
              <button className="c-input-eye" onClick={() => setShowPw((s) => !s)} type="button">
                {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {isRegister && (
            <div className="c-field">
              <label>Confirm password</label>
              <div className="c-input-wrap">
                <Lock size={15} className="c-input-icon" />
                <input
                  type={showPw ? "text" : "password"}
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onKeyDown={onKey}
                />
              </div>
              {confirm.length > 0 && confirm !== password && (
                <div className="c-field-hint c-field-hint--warn">Passwords don't match yet.</div>
              )}
            </div>
          )}

          <button className="c-btn c-btn--primary c-btn--block" onClick={submit} disabled={busy}>
            {busy ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
          </button>

          <p className="c-auth-switch">
            {isRegister ? "Already have an account?" : "New to STOCK?"}{" "}
            <button onClick={onSwitch}>{isRegister ? "Sign in" : "Create one"}</button>
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Email verification screen                                           */
/* ------------------------------------------------------------------ */

function VerifyScreen({ email, code, onVerify, onResend, onBack }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    await onVerify(value);
    setBusy(false);
  };

  return (
    <div className="c-auth c-auth--center">
      <div className="c-card c-auth-card">
        <button className="c-back" onClick={onBack}><ArrowLeft size={14} /> Back</button>
        <div className="c-verify-icon"><ShieldCheck size={22} /></div>
        <h2 className="c-verify-title">Verify your email</h2>
        <p className="c-verify-sub">
          We'd normally send a code to <strong>{email}</strong>. This preview environment
          can't send real emails, so here's the code STOCK generated for this account:
        </p>
        <div className="c-code-display">{code}</div>
        <div className="c-field">
          <label>Enter verification code</label>
          <div className="c-input-wrap">
            <Hash size={15} className="c-input-icon" />
            <input
              type="text"
              placeholder="6-digit code"
              value={value}
              maxLength={6}
              onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
        </div>
        <button className="c-btn c-btn--primary c-btn--block" onClick={submit} disabled={busy || value.length < 4}>
          {busy ? "Verifying…" : "Verify & continue"}
        </button>
        <button className="c-link-btn" onClick={onResend}>Generate a new code</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main app                                                             */
/* ------------------------------------------------------------------ */

function MainApp({ session, items, onLogout, onSaveItem, onDeleteItem }) {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [viewingItem, setViewingItem] = useState(null);

  const categories = Array.from(
    new Set([...DEFAULT_CATEGORIES, ...items.map((i) => i.category).filter(Boolean)])
  );

  const scoped = activeTab === "My Listings" ? items.filter((i) => i.ownerEmail === session.email)
    : activeTab === "All" ? items
    : items.filter((i) => i.category === activeTab);

  const visible = scoped.filter((i) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return i.name.toLowerCase().includes(q) || (i.description || "").toLowerCase().includes(q);
  });

  const recent = items.slice(0, 12);

  return (
    <div className="c-app">
      <header className="c-header">
        <div className="c-brand-mark c-brand-mark--sm">
          <Sparkles size={16} />
          <span>STOCK</span>
        </div>
        <div className="c-search">
          <Search size={15} className="c-input-icon" />
          <input
            placeholder="Search listings…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button className="c-btn c-btn--primary c-btn--icon" onClick={() => { setEditingItem(null); setShowForm(true); }}>
          <Plus size={16} /> New listing
        </button>
        <div className="c-user">
          <div className="c-avatar">{session.username.slice(0, 1).toUpperCase()}</div>
          <span className="c-username">@{session.username}</span>
          <button className="c-icon-btn" onClick={onLogout} title="Sign out"><LogOut size={16} /></button>
        </div>
      </header>

      {recent.length > 0 && (
        <div className="c-ticker">
          <div className="c-ticker-track">
            {[...recent, ...recent].map((it, idx) => (
              <span className="c-ticker-item" key={idx}>
                {it.name.toUpperCase()} <em>${formatPrice(it.price)}</em> · QTY {it.quantity}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="c-tabs">
        {["All", "My Listings", ...categories].map((tab) => (
          <button
            key={tab}
            className={`c-tab ${activeTab === tab ? "is-active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <main className="c-grid-wrap">
        {visible.length === 0 ? (
          <div className="c-empty">
            <Package size={28} />
            <p>Nothing here yet.</p>
            <span>
              {activeTab === "My Listings"
                ? "Publish your first item to see it here."
                : "Try another tab, search term, or publish something new."}
            </span>
          </div>
        ) : (
          <div className="c-item-grid">
            {visible.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                isOwner={item.ownerEmail === session.email}
                onClick={() => setViewingItem(item)}
                onEdit={() => { setEditingItem(item); setShowForm(true); }}
                onDelete={() => onDeleteItem(item.id)}
              />
            ))}
          </div>
        )}
      </main>

      {showForm && (
        <ItemFormModal
          initial={editingItem}
          categories={categories}
          onClose={() => setShowForm(false)}
          onSave={async (data) => { await onSaveItem(data); setShowForm(false); }}
        />
      )}

      {viewingItem && (
        <ItemDetailModal
          item={viewingItem}
          isOwner={viewingItem.ownerEmail === session.email}
          onClose={() => setViewingItem(null)}
          onEdit={() => { setEditingItem(viewingItem); setViewingItem(null); setShowForm(true); }}
          onDelete={async () => { await onDeleteItem(viewingItem.id); setViewingItem(null); }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Item card + detail + form                                           */
/* ------------------------------------------------------------------ */

function ItemCard({ item, isOwner, onClick, onEdit, onDelete }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="c-item-card-wrap">
      <button className="c-item-card" onClick={onClick}>
        <div className="c-item-img-wrap">
          {item.image ? (
            <img src={item.image} alt={item.name} className="c-item-img" />
          ) : (
            <div className="c-item-img-fallback"><Package size={26} /></div>
          )}
          <span className="c-item-qty">QTY {item.quantity}</span>
        </div>
        <div className="c-item-body">
          <div className="c-item-top">
            <span className="c-item-cat">{item.category || "Uncategorized"}</span>
            <span className="c-item-price">${formatPrice(item.price)}</span>
          </div>
          <h3 className="c-item-name">{item.name}</h3>
          <p className="c-item-desc">{item.description}</p>
          <div className="c-item-owner">@{item.ownerUsername}</div>
        </div>
      </button>

      {isOwner && !confirming && (
        <div className="c-card-actions">
          <button
            className="c-card-action-btn"
            title="Edit listing"
            onClick={(e) => { e.stopPropagation(); onEdit(); }}
          >
            <Pencil size={13} />
          </button>
          <button
            className="c-card-action-btn c-card-action-btn--danger"
            title="Delete listing"
            onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
          >
            <Trash2 size={13} />
          </button>
        </div>
      )}

      {isOwner && confirming && (
        <div className="c-card-confirm" onClick={(e) => e.stopPropagation()}>
          <span>Delete this listing?</span>
          <div className="c-card-confirm-actions">
            <button className="c-btn c-btn--danger c-btn--xs" onClick={onDelete}>Delete</button>
            <button className="c-btn c-btn--ghost c-btn--xs" onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ItemDetailModal({ item, isOwner, onClose, onEdit, onDelete }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="c-modal-backdrop" onClick={onClose}>
      <div className="c-modal c-modal--wide" onClick={(e) => e.stopPropagation()}>
        <button className="c-modal-close" onClick={onClose}><X size={16} /></button>
        <div className="c-detail">
          <div className="c-detail-img-wrap">
            {item.image ? (
              <img src={item.image} alt={item.name} className="c-detail-img" />
            ) : (
              <div className="c-item-img-fallback c-detail-img-fallback"><Package size={40} /></div>
            )}
          </div>
          <div className="c-detail-body">
            <span className="c-item-cat">{item.category || "Uncategorized"}</span>
            <h2 className="c-detail-name">{item.name}</h2>
            <p className="c-detail-desc">{item.description || "No description provided."}</p>
            <div className="c-detail-meta">
              <div><label>Price</label><span className="c-mono">${formatPrice(item.price)}</span></div>
              <div><label>Quantity</label><span className="c-mono">{item.quantity}</span></div>
              <div><label>Listed by</label><span>@{item.ownerUsername}</span></div>
            </div>
            {isOwner && (
              <div className="c-detail-actions">
                <button className="c-btn c-btn--ghost" onClick={onEdit}><Pencil size={14} /> Edit</button>
                {!confirming ? (
                  <button className="c-btn c-btn--danger" onClick={() => setConfirming(true)}><Trash2 size={14} /> Delete</button>
                ) : (
                  <>
                    <button className="c-btn c-btn--danger" onClick={onDelete}>Confirm delete</button>
                    <button className="c-btn c-btn--ghost" onClick={() => setConfirming(false)}>Cancel</button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ItemFormModal({ initial, categories, onClose, onSave }) {
  const [name, setName] = useState(initial?.name || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  const [price, setPrice] = useState(initial?.price ?? "");
  const [category, setCategory] = useState(initial?.category || "");
  const [imageMode, setImageMode] = useState(initial?.image?.startsWith("http") ? "url" : "upload");
  const [imageUrl, setImageUrl] = useState(initial?.image?.startsWith("http") ? initial.image : "");
  const [imageData, setImageData] = useState(initial?.image?.startsWith("data:") ? initial.image : "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await compressImage(file);
      setImageData(dataUrl);
    } catch {
      setError("Couldn't read that image.");
    }
    setUploading(false);
  };

  const finalImage = imageMode === "url" ? imageUrl.trim() : imageData;

  const submit = () => {
    if (!name.trim()) return setError("Give your item a name.");
    if (Number(price) < 0 || price === "") return setError("Enter a price.");
    if (Number(quantity) < 1) return setError("Quantity must be at least 1.");
    setError("");
    onSave({
      id: initial?.id,
      name: name.trim(),
      description: description.trim(),
      quantity: Number(quantity),
      price: Number(price),
      category: category.trim() || "Other",
      image: finalImage || "",
    });
  };

  return (
    <div className="c-modal-backdrop" onClick={onClose}>
      <div className="c-modal" onClick={(e) => e.stopPropagation()}>
        <button className="c-modal-close" onClick={onClose}><X size={16} /></button>
        <h2 className="c-modal-title">{initial ? "Edit listing" : "New listing"}</h2>

        <div className="c-field">
          <label>Item name</label>
          <div className="c-input-wrap">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vintage film camera" />
          </div>
        </div>

        <div className="c-field">
          <label>Description</label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Condition, details, anything a buyer should know…"
          />
        </div>

        <div className="c-field-row">
          <div className="c-field">
            <label>Quantity</label>
            <div className="c-input-wrap">
              <input type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
            </div>
          </div>
          <div className="c-field">
            <label>Price (USD)</label>
            <div className="c-input-wrap">
              <span className="c-input-prefix">$</span>
              <input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
            </div>
          </div>
        </div>

        <div className="c-field">
          <label>Category / tab</label>
          <div className="c-input-wrap">
            <input
              list="cache-categories"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Pick existing or type a new one"
            />
          </div>
          <datalist id="cache-categories">
            {categories.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>

        <div className="c-field">
          <label>Image</label>
          <div className="c-tabbtns c-tabbtns--sm">
            <button className={`c-tabbtn ${imageMode === "upload" ? "is-active" : ""}`} onClick={() => setImageMode("upload")}>
              <Upload size={13} /> Upload
            </button>
            <button className={`c-tabbtn ${imageMode === "url" ? "is-active" : ""}`} onClick={() => setImageMode("url")}>
              <LinkIcon size={13} /> Image URL
            </button>
          </div>

          {imageMode === "upload" ? (
            <div className="c-dropzone" onClick={() => fileRef.current?.click()}>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              {imageData ? (
                <img src={imageData} alt="preview" className="c-dropzone-preview" />
              ) : (
                <div className="c-dropzone-empty">
                  <Upload size={20} />
                  <span>{uploading ? "Processing…" : "Click to choose an image"}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="c-input-wrap">
              <LinkIcon size={15} className="c-input-icon" />
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/photo.jpg"
              />
            </div>
          )}
        </div>

        {error && <div className="c-field-hint c-field-hint--warn">{error}</div>}

        <button className="c-btn c-btn--primary c-btn--block" onClick={submit}>
          {initial ? "Save changes" : "Publish listing"}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* CSS                                                                  */
/* ------------------------------------------------------------------ */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');

.c-root {
  --bg-void: #090a12;
  --bg-panel: #10121d;
  --glass: rgba(255,255,255,0.045);
  --glass-hover: rgba(255,255,255,0.075);
  --glass-border: rgba(255,255,255,0.10);
  --cyan: #5ad8e6;
  --violet: #9b8cf7;
  --gold: #dab97e;
  --text: #edf0f7;
  --text-dim: #8b91a6;
  --success: #4fdb9c;
  --danger: #f3697e;
  position: relative;
  min-height: 100vh;
  background: var(--bg-void);
  color: var(--text);
  font-family: 'Inter', sans-serif;
  overflow-x: hidden;
}
.c-root * { box-sizing: border-box; }
.c-mono, .c-item-price, .c-detail-meta span.c-mono, .c-ticker-item { font-family: 'JetBrains Mono', monospace; }

.c-grid-bg {
  position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background-image:
    linear-gradient(rgba(90,216,230,0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(90,216,230,0.05) 1px, transparent 1px);
  background-size: 42px 42px;
  mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 90%);
}

.c-boot { position: relative; z-index: 1; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; }
.c-boot-mark { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 28px; letter-spacing: 0.08em; color: var(--cyan); }
.c-boot-bar { width: 160px; height: 2px; background: var(--glass-border); border-radius: 2px; overflow: hidden; }
.c-boot-fill { width: 40%; height: 100%; background: linear-gradient(90deg, var(--cyan), var(--violet)); animation: c-boot-slide 1.1s ease-in-out infinite; }
@keyframes c-boot-slide { 0% { transform: translateX(-100%);} 100% { transform: translateX(350%);} }

.c-banner {
  position: fixed; top: 18px; left: 50%; transform: translateX(-50%); z-index: 200;
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px; border-radius: 10px;
  background: var(--bg-panel); border: 1px solid var(--glass-border);
  font-size: 13px; font-weight: 500;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
}
.c-banner--error { color: var(--danger); border-color: rgba(243,105,126,0.35); }
.c-banner--success { color: var(--success); border-color: rgba(79,219,156,0.35); }

.c-brand-mark { display: flex; align-items: center; gap: 8px; font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 20px; letter-spacing: 0.06em; color: var(--text); }
.c-brand-mark svg { color: var(--cyan); }
.c-brand-mark--sm { font-size: 16px; }

/* Auth */
.c-auth { position: relative; z-index: 1; min-height: 100vh; display: grid; grid-template-columns: 1.15fr 1fr; }
.c-auth--center { grid-template-columns: 1fr; align-items: center; justify-items: center; padding: 24px; }
.c-auth-brand { padding: 64px; display: flex; flex-direction: column; justify-content: center; gap: 22px; border-right: 1px solid var(--glass-border); }
.c-auth-headline { font-family: 'Space Grotesk', sans-serif; font-size: 40px; line-height: 1.15; font-weight: 600; margin: 6px 0; max-width: 480px; }
.c-auth-sub { color: var(--text-dim); max-width: 420px; font-size: 15px; line-height: 1.6; }
.c-auth-features { list-style: none; padding: 0; margin: 12px 0 0; display: flex; flex-direction: column; gap: 12px; }
.c-auth-features li { display: flex; align-items: center; gap: 10px; font-size: 14px; color: var(--text-dim); }
.c-auth-features li svg { color: var(--gold); flex-shrink: 0; }
.c-auth-panel { display: flex; align-items: center; justify-content: center; padding: 40px; }

.c-card { background: var(--glass); border: 1px solid var(--glass-border); border-radius: 18px; backdrop-filter: blur(20px); }
.c-auth-card { width: 380px; padding: 30px; display: flex; flex-direction: column; gap: 4px; position: relative; }

.c-tabbtns { display: flex; background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); border-radius: 10px; padding: 3px; margin-bottom: 18px; }
.c-tabbtns--sm { margin-bottom: 10px; }
.c-tabbtn { flex: 1; background: none; border: none; color: var(--text-dim); font-family: 'Inter'; font-weight: 500; font-size: 13px; padding: 8px 10px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: all .15s; }
.c-tabbtn.is-active { background: var(--glass-hover); color: var(--text); box-shadow: inset 0 0 0 1px var(--glass-border); }

.c-field { margin-bottom: 14px; }
.c-field label { display: block; font-size: 12px; color: var(--text-dim); margin-bottom: 6px; font-weight: 500; letter-spacing: 0.02em; }
.c-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.c-field-hint { font-size: 12px; margin-top: 6px; }
.c-field-hint--warn { color: var(--danger); }

.c-input-wrap { position: relative; display: flex; align-items: center; background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); border-radius: 10px; padding: 0 12px; transition: border-color .15s; }
.c-input-wrap:focus-within { border-color: var(--cyan); }
.c-input-wrap input, .c-input-wrap select { flex: 1; background: none; border: none; outline: none; color: var(--text); font-size: 14px; padding: 11px 8px; font-family: 'Inter'; }
.c-input-icon { color: var(--text-dim); flex-shrink: 0; }
.c-input-prefix { color: var(--text-dim); font-family: 'JetBrains Mono'; font-size: 13px; }
.c-input-eye { background: none; border: none; color: var(--text-dim); cursor: pointer; display: flex; padding: 4px; }
textarea { width: 100%; background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); border-radius: 10px; color: var(--text); font-size: 14px; padding: 11px 12px; font-family: 'Inter'; resize: vertical; outline: none; }
textarea:focus { border-color: var(--cyan); }

.c-btn { border: none; border-radius: 10px; font-family: 'Inter'; font-weight: 600; font-size: 14px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 11px 18px; transition: transform .1s, opacity .15s; }
.c-btn:active { transform: scale(0.98); }
.c-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.c-btn--primary { background: linear-gradient(135deg, var(--cyan), var(--violet)); color: #0a0b12; }
.c-btn--block { width: 100%; margin-top: 6px; }
.c-btn--ghost { background: var(--glass); border: 1px solid var(--glass-border); color: var(--text); }
.c-btn--danger { background: rgba(243,105,126,0.12); border: 1px solid rgba(243,105,126,0.4); color: var(--danger); }
.c-btn--icon { padding: 10px 16px; }
.c-icon-btn { background: none; border: none; color: var(--text-dim); cursor: pointer; padding: 6px; border-radius: 8px; display: flex; }
.c-icon-btn:hover { color: var(--text); background: var(--glass); }

.c-auth-switch { text-align: center; font-size: 13px; color: var(--text-dim); margin-top: 14px; }
.c-auth-switch button { background: none; border: none; color: var(--cyan); font-weight: 600; cursor: pointer; }
.c-link-btn { background: none; border: none; color: var(--cyan); font-size: 13px; font-weight: 500; cursor: pointer; margin-top: 10px; align-self: center; }
.c-back { position: absolute; top: 20px; left: 20px; background: none; border: none; color: var(--text-dim); font-size: 12px; display: flex; align-items: center; gap: 4px; cursor: pointer; }

.c-verify-icon { width: 46px; height: 46px; border-radius: 50%; background: var(--glass-hover); display: flex; align-items: center; justify-content: center; color: var(--cyan); margin: 12px auto 6px; }
.c-verify-title { font-family: 'Space Grotesk'; text-align: center; font-size: 20px; margin: 0 0 8px; }
.c-verify-sub { text-align: center; font-size: 13px; color: var(--text-dim); line-height: 1.6; margin-bottom: 16px; }
.c-code-display { text-align: center; font-family: 'JetBrains Mono'; font-size: 26px; letter-spacing: 0.3em; color: var(--gold); background: rgba(218,185,126,0.08); border: 1px dashed rgba(218,185,126,0.4); border-radius: 10px; padding: 12px; margin-bottom: 18px; }

/* App shell */
.c-app { position: relative; z-index: 1; min-height: 100vh; }
.c-header { display: grid; grid-template-columns: auto 1fr auto auto; align-items: center; gap: 18px; padding: 16px 28px; border-bottom: 1px solid var(--glass-border); position: sticky; top: 0; background: rgba(9,10,18,0.85); backdrop-filter: blur(16px); z-index: 20; }
.c-search { display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); border-radius: 10px; padding: 0 12px; max-width: 420px; }
.c-search input { flex: 1; background: none; border: none; outline: none; color: var(--text); padding: 9px 6px; font-size: 13px; }
.c-user { display: flex; align-items: center; gap: 10px; }
.c-avatar { width: 30px; height: 30px; border-radius: 50%; background: linear-gradient(135deg, var(--cyan), var(--violet)); color: #0a0b12; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; font-family: 'Space Grotesk'; }
.c-username { font-size: 13px; color: var(--text-dim); font-family: 'JetBrains Mono'; }

.c-ticker { border-bottom: 1px solid var(--glass-border); background: rgba(90,216,230,0.03); overflow: hidden; padding: 8px 0; }
.c-ticker-track { display: flex; gap: 32px; white-space: nowrap; animation: c-ticker-scroll 34s linear infinite; width: max-content; }
.c-ticker-item { font-size: 12px; letter-spacing: 0.03em; color: var(--text-dim); }
.c-ticker-item em { font-style: normal; color: var(--gold); margin: 0 2px; }
@keyframes c-ticker-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }

.c-tabs { display: flex; gap: 8px; padding: 16px 28px 0; overflow-x: auto; }
.c-tab { flex-shrink: 0; background: var(--glass); border: 1px solid var(--glass-border); color: var(--text-dim); font-size: 13px; font-weight: 500; padding: 8px 16px; border-radius: 999px; cursor: pointer; transition: all .15s; }
.c-tab.is-active { background: var(--glass-hover); color: var(--cyan); border-color: rgba(90,216,230,0.4); }

.c-grid-wrap { padding: 22px 28px 60px; }
.c-item-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 18px; }
.c-empty { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 90px 20px; color: var(--text-dim); text-align: center; }
.c-empty svg { color: var(--text-dim); margin-bottom: 8px; }
.c-empty p { font-weight: 600; color: var(--text); margin: 0; }
.c-empty span { font-size: 13px; max-width: 320px; }

.c-item-card-wrap { position: relative; }
.c-item-card { width: 100%; text-align: left; background: var(--glass); border: 1px solid var(--glass-border); border-radius: 14px; overflow: hidden; cursor: pointer; padding: 0; display: flex; flex-direction: column; transition: transform .15s, border-color .15s; }
.c-item-card:hover { transform: translateY(-3px); border-color: rgba(90,216,230,0.4); }
.c-card-actions { position: absolute; top: 10px; left: 10px; z-index: 3; display: flex; gap: 6px; opacity: 0; transition: opacity .15s; }
.c-item-card-wrap:hover .c-card-actions { opacity: 1; }
.c-card-action-btn { width: 28px; height: 28px; border-radius: 50%; background: rgba(9,10,18,0.75); border: 1px solid var(--glass-border); color: var(--text); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background .15s, color .15s; }
.c-card-action-btn:hover { background: rgba(90,216,230,0.18); color: var(--cyan); border-color: rgba(90,216,230,0.4); }
.c-card-action-btn--danger:hover { background: rgba(243,105,126,0.18); color: var(--danger); border-color: rgba(243,105,126,0.4); }
.c-card-confirm { position: absolute; inset: 0; z-index: 4; background: rgba(9,10,18,0.92); border-radius: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 16px; text-align: center; }
.c-card-confirm span { font-size: 13px; font-weight: 600; }
.c-card-confirm-actions { display: flex; gap: 8px; }
.c-btn--xs { padding: 7px 14px; font-size: 12.5px; }
.c-item-img-wrap { position: relative; aspect-ratio: 4/3; background: rgba(255,255,255,0.02); }
.c-item-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.c-item-img-fallback { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--text-dim); }
.c-item-qty { position: absolute; bottom: 8px; right: 8px; background: rgba(9,10,18,0.75); border: 1px solid var(--glass-border); font-family: 'JetBrains Mono'; font-size: 11px; padding: 3px 8px; border-radius: 999px; color: var(--text); }
.c-item-body { padding: 14px; display: flex; flex-direction: column; gap: 6px; }
.c-item-top { display: flex; justify-content: space-between; align-items: center; }
.c-item-cat { font-size: 10px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--violet); font-weight: 600; }
.c-item-price { color: var(--gold); font-size: 13px; font-weight: 600; }
.c-item-name { font-family: 'Space Grotesk'; font-size: 15px; margin: 0; font-weight: 600; }
.c-item-desc { font-size: 12.5px; color: var(--text-dim); margin: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.5; }
.c-item-owner { font-size: 11px; color: var(--text-dim); font-family: 'JetBrains Mono'; margin-top: 2px; }

/* Modals */
.c-modal-backdrop { position: fixed; inset: 0; background: rgba(5,6,10,0.7); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 20px; }
.c-modal { background: var(--bg-panel); border: 1px solid var(--glass-border); border-radius: 18px; padding: 28px; width: 100%; max-width: 440px; max-height: 88vh; overflow-y: auto; position: relative; }
.c-modal--wide { max-width: 720px; padding: 0; overflow: hidden; }
.c-modal-close { position: absolute; top: 16px; right: 16px; background: var(--glass); border: 1px solid var(--glass-border); color: var(--text-dim); width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 5; }
.c-modal-title { font-family: 'Space Grotesk'; font-size: 19px; margin: 0 0 18px; }

.c-dropzone { border: 1px dashed var(--glass-border); border-radius: 12px; cursor: pointer; overflow: hidden; }
.c-dropzone-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 30px; color: var(--text-dim); font-size: 13px; }
.c-dropzone-preview { width: 100%; max-height: 180px; object-fit: cover; display: block; }

.c-detail { display: grid; grid-template-columns: 1fr 1fr; }
.c-detail-img-wrap { background: rgba(255,255,255,0.02); }
.c-detail-img { width: 100%; height: 100%; object-fit: cover; display: block; min-height: 340px; }
.c-detail-img-fallback { min-height: 340px; }
.c-detail-body { padding: 28px; display: flex; flex-direction: column; gap: 10px; }
.c-detail-name { font-family: 'Space Grotesk'; font-size: 22px; margin: 4px 0; }
.c-detail-desc { font-size: 13.5px; color: var(--text-dim); line-height: 1.6; }
.c-detail-meta { display: flex; gap: 22px; margin: 14px 0; }
.c-detail-meta label { display: block; font-size: 11px; color: var(--text-dim); margin-bottom: 3px; }
.c-detail-meta span { font-size: 14px; font-weight: 600; }
.c-detail-actions { display: flex; gap: 10px; margin-top: 10px; }

@media (max-width: 860px) {
  .c-auth { grid-template-columns: 1fr; }
  .c-auth-brand { border-right: none; border-bottom: 1px solid var(--glass-border); padding: 40px 24px; }
  .c-detail { grid-template-columns: 1fr; }
  .c-header { grid-template-columns: auto 1fr auto; grid-template-areas: "brand search user" "add add add"; }
  .c-search { max-width: none; }
}

/* ================================================================
   MOBILE / ANDROID RESPONSIVE PATCH
   Desktop layout is intentionally left unchanged.
   ================================================================ */

html, body {
  width: 100%;
  min-width: 0;
  overflow-x: hidden;
  -webkit-text-size-adjust: 100%;
}

button, input, select, textarea {
  -webkit-tap-highlight-color: transparent;
}

.c-root {
  width: 100%;
  min-width: 0;
}

.c-header,
.c-app,
.c-auth,
.c-grid-wrap,
.c-tabs {
  min-width: 0;
}

.c-search,
.c-search input,
.c-input-wrap,
.c-input-wrap input,
.c-input-wrap select,
textarea {
  min-width: 0;
}

.c-item-card,
.c-item-card * {
  max-width: 100%;
}

@media (max-width: 860px) {
  .c-auth {
    min-height: 100dvh;
  }

  .c-auth-brand {
    padding: 38px 24px;
  }

  .c-auth-headline {
    font-size: clamp(30px, 7vw, 38px);
  }

  .c-auth-panel {
    padding: 28px 20px 40px;
  }

  .c-auth-card {
    width: min(100%, 420px);
  }

  .c-header {
    grid-template-columns: 1fr auto;
    grid-template-areas:
      "brand user"
      "search search"
      "add add";
    gap: 10px 12px;
    padding: 12px 16px;
  }

  .c-header > .c-brand-mark {
    grid-area: brand;
    min-width: 0;
  }

  .c-header > .c-search {
    grid-area: search;
    width: 100%;
    max-width: none;
  }

  .c-header > .c-btn--primary {
    grid-area: add;
    width: 100%;
  }

  .c-header > .c-user {
    grid-area: user;
    min-width: 0;
  }

  .c-username {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .c-grid-wrap {
    padding: 16px 16px 40px;
  }

  .c-tabs {
    padding: 12px 16px 0;
    scrollbar-width: none;
  }

  .c-tabs::-webkit-scrollbar {
    display: none;
  }

  .c-item-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .c-card-actions {
    opacity: 1;
    top: 8px;
    left: 8px;
  }

  .c-item-body {
    padding: 12px;
  }

  .c-item-name {
    font-size: 14px;
  }

  .c-item-desc {
    font-size: 12px;
  }

  .c-modal-backdrop {
    padding: 12px;
    align-items: center;
  }

  .c-modal {
    max-height: 92dvh;
  }

  .c-modal--wide {
    max-width: 100%;
    width: 100%;
  }

  .c-detail {
    grid-template-columns: 1fr;
  }

  .c-detail-img,
  .c-detail-img-fallback {
    min-height: 0;
    height: min(55vw, 360px);
  }

  .c-detail-body {
    padding: 22px 18px 24px;
  }

  .c-detail-meta {
    flex-wrap: wrap;
    gap: 14px 24px;
  }

  .c-field-row {
    grid-template-columns: 1fr;
    gap: 0;
  }
}

@media (max-width: 600px) {
  .c-auth {
    display: block;
    min-height: 100dvh;
  }

  .c-auth-brand {
    border-right: 0;
    border-bottom: 1px solid var(--glass-border);
    padding: 28px 18px 22px;
    gap: 12px;
    text-align: center;
    align-items: center;
  }

  .c-auth-brand .c-auth-sub {
    margin: 0;
    font-size: 13px;
  }

  .c-auth-features {
    display: none;
  }

  .c-auth-headline {
    font-size: clamp(27px, 8vw, 34px);
    line-height: 1.12;
    margin: 2px 0;
  }

  .c-auth-panel {
    padding: 18px 12px 32px;
    align-items: flex-start;
  }

  .c-auth-card {
    width: 100%;
    padding: 20px 16px;
    border-radius: 14px;
  }

  .c-field {
    margin-bottom: 12px;
  }

  .c-input-wrap input,
  .c-input-wrap select,
  textarea {
    font-size: 16px;
  }

  .c-btn {
    min-height: 44px;
  }

  .c-banner {
    top: 10px;
    width: calc(100% - 20px);
    max-width: 420px;
    padding: 10px 12px;
    font-size: 12px;
  }

  .c-ticker {
    padding: 7px 0;
  }

  .c-ticker-item {
    font-size: 11px;
  }

  .c-tab {
    min-height: 40px;
    padding: 8px 13px;
  }

  .c-item-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .c-item-img-wrap {
    aspect-ratio: 16 / 10;
  }

  .c-item-body {
    padding: 13px;
  }

  .c-item-name {
    font-size: 15px;
  }

  .c-item-desc {
    -webkit-line-clamp: 3;
  }

  .c-modal-backdrop {
    padding: 0;
    align-items: flex-end;
  }

  .c-modal,
  .c-modal--wide {
    width: 100%;
    max-width: none;
    max-height: 96dvh;
    border-radius: 18px 18px 0 0;
    padding: 20px 16px 24px;
  }

  .c-modal--wide {
    padding: 0;
  }

  .c-modal-close {
    top: 10px;
    right: 10px;
  }

  .c-dropzone-empty {
    padding: 24px 14px;
  }

  .c-detail-img,
  .c-detail-img-fallback {
    height: 58vw;
    max-height: 300px;
  }

  .c-detail-body {
    padding: 20px 16px 24px;
  }

  .c-detail-name {
    font-size: 20px;
    padding-right: 30px;
  }

  .c-detail-meta {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .c-detail-actions {
    flex-direction: column;
  }

  .c-detail-actions .c-btn {
    width: 100%;
  }

  .c-code-display {
    font-size: 22px;
    letter-spacing: 0.22em;
  }

  .c-empty {
    padding: 60px 16px;
  }
}

@media (max-width: 380px) {
  .c-header {
    padding: 10px 12px;
  }

  .c-brand-mark--sm {
    font-size: 14px;
  }

  .c-avatar {
    width: 28px;
    height: 28px;
  }

  .c-username {
    display: none;
  }

  .c-grid-wrap {
    padding-left: 12px;
    padding-right: 12px;
  }

  .c-tabs {
    padding-left: 12px;
    padding-right: 12px;
  }

  .c-auth-card {
    padding: 18px 14px;
  }
}

`;
