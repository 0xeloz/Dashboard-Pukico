/**
 * Receipt Image Generator for Pukico (Canvas 2D)
 * Renders a crisp 1080px wide PNG receipt card for sharing.
 */

export interface ReceiptRowItem {
  label: string;
  value: string;
  isMonospace?: boolean;
  highlight?: boolean;
}

export interface ReceiptData {
  lang: 'en' | 'id';
  nominal: string; // e.g. "10,00 USDC" or "0,002 ETH"
  senderId: string;
  recipientId: string;
  timeStr: string;
  networkName: string;
  statusLabel: string;
  txHashShort: string;
  isOutgoing: boolean;
  amountFormatted: string;
  serviceFeeFormatted?: string | null;
  totalFromYouFormatted?: string | null;
  networkFeeFormatted?: string | null;
  labels: {
    receiptTitle: string;
    from: string;
    to: string;
    time: string;
    network: string;
    amount: string;
    serviceFee: string;
    totalFromYou: string;
    networkFee: string;
    hash: string;
    footer: string;
  };
}

function loadLogo(): Promise<HTMLImageElement | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => {
      resolve(null);
    }, 2000);
    img.onload = () => {
      clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = '/pukico-logo.png';
  });
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Render transaction receipt into a high-DPI PNG Blob
 */
export async function renderReceiptPng(data: ReceiptData): Promise<Blob> {
  const logoImg = await loadLogo();

  // Assemble detail rows
  const rows: ReceiptRowItem[] = [];

  // 1. Time
  if (data.timeStr) {
    rows.push({
      label: data.labels.time,
      value: data.timeStr,
    });
  }

  // 2. Network
  rows.push({
    label: data.labels.network,
    value: data.networkName,
  });

  // 3. For outgoing transactions: Amount, Service Fee, Total, Network Fee
  if (data.isOutgoing) {
    rows.push({
      label: data.labels.amount,
      value: data.amountFormatted,
      isMonospace: true,
    });

    if (data.serviceFeeFormatted) {
      rows.push({
        label: data.labels.serviceFee,
        value: data.serviceFeeFormatted,
        isMonospace: true,
      });
    }

    if (data.totalFromYouFormatted) {
      rows.push({
        label: data.labels.totalFromYou,
        value: data.totalFromYouFormatted,
        isMonospace: true,
        highlight: true,
      });
    }

    if (data.networkFeeFormatted) {
      rows.push({
        label: data.labels.networkFee,
        value: data.networkFeeFormatted,
        isMonospace: true,
      });
    }
  }

  // 4. Tx Hash
  if (data.txHashShort) {
    rows.push({
      label: data.labels.hash,
      value: data.txHashShort,
      isMonospace: true,
    });
  }

  // Layout measurements
  const WIDTH = 1080;
  const PADDING_X = 72;
  const PADDING_TOP = 64;
  const HEADER_HEIGHT = 76;
  const HEADER_GAP = 40;
  const AMOUNT_SECTION_HEIGHT = 136;
  const SECTION_GAP = 32;
  const DIVIDER_HEIGHT = 2;
  const ROWS_START_GAP = 28;
  const ROW_HEIGHT = 58;
  const ROWS_END_GAP = 24;
  const FOOTER_GAP = 28;
  const FOOTER_HEIGHT = 32;
  const PADDING_BOTTOM = 64;

  const totalHeight =
    PADDING_TOP +
    HEADER_HEIGHT +
    HEADER_GAP +
    AMOUNT_SECTION_HEIGHT +
    SECTION_GAP +
    DIVIDER_HEIGHT +
    ROWS_START_GAP +
    rows.length * ROW_HEIGHT +
    ROWS_END_GAP +
    DIVIDER_HEIGHT +
    FOOTER_GAP +
    FOOTER_HEIGHT +
    PADDING_BOTTOM;

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = totalHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D canvas context');
  }

  // 1. Background (pure white)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, WIDTH, totalHeight);

  // 2. Top accent bar (#0052FF)
  ctx.fillStyle = '#0052FF';
  ctx.fillRect(0, 0, WIDTH, 12);

  // 3. Header: Logo, Brand + Title, Status Badge
  let curY = PADDING_TOP;
  const logoSize = 64;

  if (logoImg) {
    ctx.drawImage(logoImg, PADDING_X, curY, logoSize, logoSize);
  } else {
    // Fallback circle logo
    ctx.fillStyle = '#0052FF';
    ctx.beginPath();
    ctx.arc(PADDING_X + logoSize / 2, curY + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 34px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('P', PADDING_X + logoSize / 2, curY + logoSize / 2 + 1);
  }

  // Brand and Receipt Title
  const textLeft = PADDING_X + logoSize + 20;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  ctx.fillStyle = '#0A0B0D';
  ctx.font = '700 32px system-ui, -apple-system, sans-serif';
  ctx.fillText('Pukico', textLeft, curY + 2);

  ctx.fillStyle = '#5B6577';
  ctx.font = '500 22px system-ui, -apple-system, sans-serif';
  ctx.fillText(data.labels.receiptTitle, textLeft, curY + 38);

  // Status Badge ("✓ Terkonfirmasi" / "✓ Confirmed")
  const badgeText = `✓  ${data.statusLabel}`;
  ctx.font = '600 22px system-ui, -apple-system, sans-serif';
  const badgeMetrics = ctx.measureText(badgeText);
  const badgeWidth = badgeMetrics.width + 36;
  const badgeHeight = 44;
  const badgeX = WIDTH - PADDING_X - badgeWidth;
  const badgeY = curY + (logoSize - badgeHeight) / 2;

  drawRoundedRect(ctx, badgeX, badgeY, badgeWidth, badgeHeight, 22);
  ctx.fillStyle = '#ECFDF5';
  ctx.fill();
  ctx.strokeStyle = '#A7F3D0';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#047857';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(badgeText, badgeX + badgeWidth / 2, badgeY + badgeHeight / 2);

  // 4. Large Nominal & Counterparty Section
  curY += HEADER_HEIGHT + HEADER_GAP;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  // Nominal: big monospace
  ctx.fillStyle = '#0A0B0D';
  ctx.font = '700 64px "SF Mono", "Roboto Mono", Menlo, Consolas, monospace';
  ctx.fillText(data.nominal, PADDING_X, curY);

  // Counterparty: Dari @a → Ke @b
  const counterpartyText = `${data.labels.from} @${data.senderId}  →  ${data.labels.to} @${data.recipientId}`;
  ctx.fillStyle = '#5B6577';
  ctx.font = '500 26px system-ui, -apple-system, sans-serif';
  ctx.fillText(counterpartyText, PADDING_X, curY + 76);

  // 5. Divider
  curY += AMOUNT_SECTION_HEIGHT + SECTION_GAP;
  ctx.strokeStyle = '#E5E7EB';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PADDING_X, curY);
  ctx.lineTo(WIDTH - PADDING_X, curY);
  ctx.stroke();

  // 6. Detail Rows (Key-Value)
  curY += ROWS_START_GAP;
  for (const row of rows) {
    const rowMidY = curY + ROW_HEIGHT / 2;

    // Label (left)
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#5B6577';
    ctx.font = '500 26px system-ui, -apple-system, sans-serif';
    ctx.fillText(row.label, PADDING_X, rowMidY);

    // Value (right)
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    if (row.highlight) {
      ctx.fillStyle = '#0052FF';
      ctx.font = row.isMonospace
        ? '700 27px "SF Mono", "Roboto Mono", Menlo, Consolas, monospace'
        : '700 26px system-ui, -apple-system, sans-serif';
    } else {
      ctx.fillStyle = '#0A0B0D';
      ctx.font = row.isMonospace
        ? '600 26px "SF Mono", "Roboto Mono", Menlo, Consolas, monospace'
        : '600 26px system-ui, -apple-system, sans-serif';
    }
    ctx.fillText(row.value, WIDTH - PADDING_X, rowMidY);

    curY += ROW_HEIGHT;
  }

  // 7. Bottom Divider
  curY += ROWS_END_GAP;
  ctx.strokeStyle = '#E5E7EB';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PADDING_X, curY);
  ctx.lineTo(WIDTH - PADDING_X, curY);
  ctx.stroke();

  // 8. Footer
  curY += FOOTER_GAP;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#9CA3AF';
  ctx.font = '500 22px system-ui, -apple-system, sans-serif';
  ctx.fillText(data.labels.footer, WIDTH / 2, curY);

  // Export to Blob
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Canvas toBlob failed'));
      }
    }, 'image/png');
  });
}
