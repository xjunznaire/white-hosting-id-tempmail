const $ = (id) => document.getElementById(id);
const state = { mode: "custom", address: "", token: "", expiresAt: 0, messages: [], selectedId: "", lang: "en", refreshTimer: null };
const translations = {
  id: {
    serviceStatus:"Layanan siap", headline:"Inbox sementara kamu.<br><em>Siap dalam hitungan detik.</em>",
    subheadline:"Buat alamat email sementara untuk menerima pesan tanpa membagikan inbox pribadi.",
    createTitle:"Buat alamat email", noSignup:"TANPA DAFTAR", customMode:"Alamat custom", randomMode:"Alamat acak",
    usernameLabel:"Tentukan nama email", usernameHint:"Gunakan huruf kecil, angka, titik, garis bawah, atau tanda hubung.",
    domainLabel:"Pilih domain email", randomHint:"Kami akan membuat alamat acak yang unik untukmu.",
    createBtn:"Buat email sementara", inboxTitle:"Kotak masuk kamu", yourAddress:"ALAMAT EMAIL KAMU", copy:"Salin",
    emptyTitle:"Menunggu email masuk", emptyText:"Pesan yang dikirim ke alamatmu akan muncul di sini otomatis.",
    selectMessage:"Pilih pesan untuk dibaca", messagePreview:"Isi email akan muncul di panel ini.",
    privacyNote:"Akses inbox dilindungi token privat browser. Jangan gunakan untuk pesan sensitif.",
    feature1Title:"Alamat instan",feature1Text:"Buat inbox custom atau acak dalam beberapa klik.",
    feature2Title:"Perbarui inbox",feature2Text:"Perbarui kotak masuk untuk memeriksa pesan baru.",
    feature3Title:"Multi-domain",feature3Text:"Pilih dari tiga domain email White Hosting ID.",
    footerText:"Layanan email sementara · Gunakan secara bertanggung jawab",
    messages:"pesan",expires:"Kedaluwarsa",from:"Dari",received:"Diterima",noSubject:"Tanpa subjek",
    invalidUsername:"Nama email tidak valid. Gunakan 1–64 karakter yang didukung.",
    createFailed:"Gagal membuat alamat.",copyDone:"Tersalin!",refreshDone:"Inbox diperbarui.",
    deleteConfirm:"Hapus alamat dan semua pesan di inbox ini?",expired:"Inbox kedaluwarsa atau tidak bisa diakses. Buat alamat baru.",
    noMessages:"Belum ada pesan masuk.",textFallback:"Pesan ini tidak memiliki isi teks yang dapat ditampilkan.",
    deleteInbox:"Hapus inbox",refreshInbox:"Perbarui inbox",waiting:"Memuat…",loadFailed:"Tidak dapat memuat pesan.",
    expiryLabel:"Masa aktif inbox",expiryHint:"Pilih berapa lama inbox ini tetap aktif.",ttl15:"15 menit",ttl60:"1 jam",ttl360:"6 jam",ttl720:"12 jam",ttl1440:"24 jam"
  },
  en: {
    serviceStatus:"Service ready", headline:"Your temporary inbox.<br><em>Ready in seconds.</em>",
    subheadline:"Create a temporary email address to receive messages without exposing your personal inbox.",
    createTitle:"Create your address", noSignup:"NO SIGN-UP", customMode:"Custom address", randomMode:"Random address",
    usernameLabel:"Choose your username", usernameHint:"Use lowercase letters, numbers, dots, underscores, or hyphens.",
    domainLabel:"Choose email domain", randomHint:"We'll generate a unique random address for you.",
    createBtn:"Create temporary email", inboxTitle:"Your inbox", yourAddress:"YOUR EMAIL ADDRESS", copy:"Copy",
    emptyTitle:"Waiting for incoming email", emptyText:"Messages sent to your address will appear here automatically.",
    selectMessage:"Select a message to read", messagePreview:"Email contents will appear in this panel.",
    privacyNote:"Inbox access is protected by a private browser token. Do not use it for sensitive mail.",
    feature1Title:"Instant address",feature1Text:"Generate custom or random inboxes in a few clicks.",
    feature2Title:"Live refresh",feature2Text:"Refresh your inbox to check for new messages.",
    feature3Title:"Multi-domain",feature3Text:"Choose from White Hosting ID email domains.",
    footerText:"Temporary email service · Use responsibly",
    messages:"messages",expires:"Expires",from:"From",received:"Received",noSubject:"No subject",
    invalidUsername:"Invalid email username. Use 1–64 supported characters.",
    createFailed:"Could not create address.",copyDone:"Copied!",refreshDone:"Inbox refreshed.",
    deleteConfirm:"Delete this address and all messages in this inbox?",expired:"Inbox expired or cannot be accessed. Create a new address.",
    noMessages:"No incoming messages yet.",textFallback:"This message has no displayable text content.",
    deleteInbox:"Delete inbox",refreshInbox:"Refresh inbox",waiting:"Loading…",loadFailed:"Could not load messages.",
    expiryLabel:"Mailbox expiration",expiryHint:"Choose how long this mailbox remains active.",ttl15:"15 minutes",ttl60:"1 hour",ttl360:"6 hours",ttl720:"12 hours",ttl1440:"24 hours"
  }
};
const t = (key) => translations[state.lang][key] || translations.en[key] || key;

function setLanguage(lang) {
  state.lang = lang;
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.dataset.i18n;
    if (translations[lang][key]) el.innerHTML = translations[lang][key];
  });
  $("langToggle").textContent = lang === "id" ? "ID / EN" : "EN / ID";
  $("refreshBtn").title = t("refreshInbox");
  $("refreshBtn").setAttribute("aria-label", t("refreshInbox"));
  $("deleteBtn").title = t("deleteInbox");
  $("deleteBtn").setAttribute("aria-label", t("deleteInbox"));
  renderMessages();
  if (state.selectedId) renderSelectedMessage();
}
function getAuth() {
  return { "Authorization": `Bearer ${state.token}` };
}
function setMode(mode) {
  state.mode = mode;
  $("customMode").classList.toggle("active", mode === "custom");
  $("randomMode").classList.toggle("active", mode === "random");
  $("customFields").classList.toggle("hidden", mode !== "custom");
  $("randomFields").classList.toggle("hidden", mode !== "random");
  $("createError").textContent = "";
}
async function createAddress() {
  const btn = $("createBtn");
  $("createError").textContent = "";
  const domain = state.mode === "custom" ? $("domainSelect").value : $("randomDomain").value;
  const body = { mode: state.mode, domain, ttlMinutes: Number($("ttlSelect").value) };
  if (state.mode === "custom") {
    body.local = $("localPart").value.trim().toLowerCase();
    if (!/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/.test(body.local) || body.local.includes("..")) {
      $("createError").textContent = t("invalidUsername"); return;
    }
  }
  btn.disabled = true;
  btn.querySelector("span").textContent = t("waiting");
  try {
    const res = await fetch("/api/mailboxes", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || t("createFailed"));
    if (state.refreshTimer) clearInterval(state.refreshTimer);
    state.address = data.address; state.token = data.token; state.expiresAt = data.expiresAt;
    state.messages = []; state.selectedId = "";
    // The token is intentionally kept only in this tab's memory, not localStorage.
    $("currentAddress").textContent = state.address;
    $("inboxPanel").classList.remove("hidden");
    $("messageView").innerHTML = `<div class="message-placeholder"><div class="empty-icon">↖</div><b>${t("selectMessage")}</b><p>${t("messagePreview")}</p></div>`;
    await refreshInbox();
    state.refreshTimer = setInterval(refreshInbox, 12000);
    $("inboxPanel").scrollIntoView({behavior:"smooth", block:"start"});
  } catch (err) {
    $("createError").textContent = err.message || t("createFailed");
  } finally {
    btn.disabled = false;
    btn.querySelector("span").textContent = t("createBtn");
  }
}
async function refreshInbox() {
  if (!state.address || !state.token) return;
  try {
    const res = await fetch(`/api/inbox/${encodeURIComponent(state.address)}`, { headers:getAuth(), cache:"no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || t("loadFailed"));
    state.expiresAt = data.expiresAt;
    state.messages = data.messages || [];
    $("messageCount").textContent = `${state.messages.length} ${t("messages")}`;
    const date = new Date(state.expiresAt);
    $("expiryText").textContent = `${t("expires")}: ${date.toLocaleString([], {month:"short", day:"numeric", hour:"2-digit", minute:"2-digit"})}`;
    renderMessages();
    if (state.selectedId && state.messages.some(m => m.id === state.selectedId)) renderSelectedMessage();
    else if (state.selectedId) {
      state.selectedId = "";
      $("messageView").innerHTML = `<div class="message-placeholder"><div class="empty-icon">↖</div><b>${t("selectMessage")}</b><p>${t("messagePreview")}</p></div>`;
    }
  } catch (err) {
    if (err.message && /expired|token|Inbox tidak ditemukan/i.test(err.message)) {
      if (state.refreshTimer) clearInterval(state.refreshTimer);
      $("createError").textContent = t("expired");
    }
  }
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
function renderMessages() {
  const box = $("messageList");
  if (!state.messages.length) {
    box.innerHTML = `<div class="empty-state"><div class="empty-icon">✉</div><b>${t("emptyTitle")}</b><p>${t("emptyText")}</p></div>`;
    return;
  }
  box.innerHTML = state.messages.map(m => `
    <button class="message-item ${m.id === state.selectedId ? "selected" : ""}" data-id="${escapeHtml(m.id)}" type="button">
      <strong>${escapeHtml(m.subject || t("noSubject"))}</strong>
      <span>${escapeHtml(m.from_address || "unknown sender")}</span>
      <small>${new Date(m.received_at).toLocaleString()}</small>
    </button>`).join("");
  box.querySelectorAll(".message-item").forEach(btn => btn.addEventListener("click", () => {
    state.selectedId = btn.dataset.id;
    renderMessages(); renderSelectedMessage();
  }));
}
function sanitizeEmailHtml(html) {
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  doc.querySelectorAll("script,iframe,object,embed,form,base,meta,link,style").forEach(el => el.remove());
  doc.querySelectorAll("*").forEach(el => {
    [...el.attributes].forEach(attr => {
      if (/^on/i.test(attr.name) || ((attr.name === "href" || attr.name === "src") && /^\s*javascript:/i.test(attr.value))) el.removeAttribute(attr.name);
    });
  });
  return doc.body.innerHTML;
}
function renderSelectedMessage() {
  const m = state.messages.find(item => item.id === state.selectedId);
  if (!m) return;
  const body = m.html_body ? sanitizeEmailHtml(m.html_body) : escapeHtml(m.text_body || t("textFallback"));
  $("messageView").innerHTML = `
    <h3>${escapeHtml(m.subject || t("noSubject"))}</h3>
    <div class="message-details">${t("from")}: ${escapeHtml(m.from_address || "unknown")}<br>${t("received")}: ${new Date(m.received_at).toLocaleString()}<br>To: ${escapeHtml(m.to_address)}</div>
    <div class="message-body">${body}</div>`;
}
async function copyAddress() {
  if (!state.address) return;
  try {
    await navigator.clipboard.writeText(state.address);
    $("copyBtn").textContent = t("copyDone");
    setTimeout(() => $("copyBtn").textContent = t("copy"), 1400);
  } catch { $("copyBtn").textContent = state.address; }
}
async function deleteInbox() {
  if (!state.address || !confirm(t("deleteConfirm"))) return;
  try {
    await fetch(`/api/mailboxes/${encodeURIComponent(state.address)}`, { method:"DELETE", headers:getAuth() });
  } finally {
    if (state.refreshTimer) clearInterval(state.refreshTimer);
    state.address = ""; state.token = ""; state.messages = []; state.selectedId = "";
    $("inboxPanel").classList.add("hidden");
  }
}
$("customMode").addEventListener("click", () => setMode("custom"));
$("randomMode").addEventListener("click", () => setMode("random"));
$("createBtn").addEventListener("click", createAddress);
$("refreshBtn").addEventListener("click", refreshInbox);
$("copyBtn").addEventListener("click", copyAddress);
$("deleteBtn").addEventListener("click", deleteInbox);
$("langToggle").addEventListener("click", () => setLanguage(state.lang === "id" ? "en" : "id"));
$("year").textContent = new Date().getFullYear();
setLanguage("en");
