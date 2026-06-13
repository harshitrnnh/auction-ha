function escAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function safeUrl(url) {
  return /^https?:\/\//i.test(url ?? '') ? url : '#';
}

export function getAppUrl() {
  return (process.env.FRONTEND_URL || '').replace(/\/$/, '');
}

export function getLotTitle(lot) {
  if (!lot) return 'Unknown item';
  try {
    if (lot.artworkHeadline && lot.artworkHeadline.startsWith('{')) {
      const parsed = JSON.parse(lot.artworkHeadline);
      if (parsed.title) return parsed.title;
    }
  } catch {}
  return lot.title || 'Unknown item';
}

export function lotNo(lot) {
  const n = lot?.lotNumber ?? lot?.lotNo;
  return n != null ? String(n).padStart(3, '0') : '001';
}

export function lotDateStr(lot) {
  try {
    return new Date(lot?.startsAt || new Date()).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch { return ''; }
}

export function productImageBlock(lot) {
  if (!lot?.artworkUrl || !/^https?:\/\//i.test(lot.artworkUrl)) return '';
  return `
    <div style="margin: 0 -24px 24px; border-bottom: 1px solid rgba(255,255,255,0.06);">
      <img src="${escAttr(lot.artworkUrl)}" alt="${escAttr(getLotTitle(lot))}"
        style="display: block; width: 100%; max-height: 380px; object-fit: cover;" />
    </div>`;
}

export function ctaButton(text, url, color = '#e6c27e') {
  if (!url) return '';
  return `
    <div style="text-align: center; margin: 28px 0 8px;">
      <a href="${escAttr(safeUrl(url))}"
        style="display: inline-block; padding: 13px 32px; background: ${escAttr(color)}; color: #0c0d15;
               font-weight: 700; font-size: 15px; border-radius: 8px; text-decoration: none;
               letter-spacing: 0.02em;">${escHtml(text)} →</a>
    </div>`;
}

export function emailWrapper(body) {
  const appUrl = getAppUrl();
  const logoLink = appUrl
    ? `<a href="${appUrl}" style="text-decoration: none;">
         <span style="font-family: monospace; font-size: 22px; font-weight: 700; color: #e6c27e; letter-spacing: 0.14em;">OXIDE</span>
       </a>`
    : `<span style="font-family: monospace; font-size: 22px; font-weight: 700; color: #e6c27e; letter-spacing: 0.14em;">OXIDE</span>`;

  const footerLink = appUrl
    ? `<a href="${appUrl}" style="color: #3d3a4c; text-decoration: none;">${appUrl.replace(/^https?:\/\//, '')}</a>`
    : 'Oxide Auction';

  return `
    <div style="font-family: sans-serif; background: #08090f; padding: 32px 16px;">
      <div style="max-width: 560px; margin: 0 auto;">
        <div style="text-align: center; margin-bottom: 24px;">
          ${logoLink}
          <div style="font-size: 10px; color: #3d3a4c; letter-spacing: 0.1em; margin-top: 3px;">ONE DROP · ONE PRINT · DAILY</div>
        </div>
        <div style="background: #0c0d15; border-radius: 14px; border: 1px solid rgba(255,255,255,0.07); overflow: hidden;">
          <div style="padding: 28px 24px;">
            ${body}
          </div>
        </div>
        <div style="text-align: center; margin-top: 18px; font-size: 11px; color: #3d3a4c; line-height: 2;">
          ${footerLink} · Oxide Auction
        </div>
      </div>
    </div>`;
}
