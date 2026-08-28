import type { Address, Hex } from 'viem'

interface InvitationEmailInput {
  amountUsdc: string
  buyer: Address
  dueAt: Date
  invoiceId: Hex
  invoiceUrl: string
  vendor: Address
}

export function buildInvitationEmail(input: InvitationEmailInput) {
  const amount = escapeHtml(input.amountUsdc)
  const buyer = escapeHtml(input.buyer)
  const dueAt = escapeHtml(
    input.dueAt.toLocaleString('en', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'UTC',
    }),
  )
  const invoiceId = escapeHtml(input.invoiceId)
  const invoiceUrl = escapeHtml(input.invoiceUrl)
  const vendor = escapeHtml(input.vendor)

  return {
    subject: `USDC invoice for ${amount}`,
    text: [
      "You've received a Ma'at supplier invoice.",
      '',
      `Amount: ${input.amountUsdc} USDC`,
      `Due: ${input.dueAt.toISOString()}`,
      `Vendor: ${input.vendor}`,
      `Buyer wallet: ${input.buyer}`,
      `Invoice ID: ${input.invoiceId}`,
      '',
      `Review and pay: ${input.invoiceUrl}`,
      '',
      'This is a testnet preview. Do not use real funds.',
    ].join('\n'),
    html: `<!doctype html>
<html lang="en">
  <body style="margin:0;background:#e9efeb;color:#102321;font-family:Inter,Arial,sans-serif;padding:32px 16px">
    <div style="max-width:620px;margin:0 auto;background:#f9fbf8;border:1px solid #c9d8d1;border-radius:24px;overflow:hidden;box-shadow:0 18px 50px rgba(16,35,33,.12)">
      <div style="padding:28px 32px;background:#092f2c;color:#f8f3df">
        <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#8ed7cb">Ma'at verified settlement</div>
        <h1 style="font-family:Georgia,serif;font-size:38px;line-height:1.05;font-weight:400;margin:16px 0 8px">A supplier invoice is ready.</h1>
        <p style="margin:0;color:#c4ded8;line-height:1.6">Review the terms, access your secured wallet, and settle in USDC.</p>
      </div>
      <div style="padding:30px 32px">
        <div style="padding:20px;border:1px solid #d8e2dc;border-radius:16px;background:#fff">
          <div style="font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:#607773">Amount due</div>
          <div style="font-family:Georgia,serif;font-size:34px;margin-top:8px">${amount} <span style="font-family:Inter,Arial,sans-serif;font-size:15px;color:#607773">USDC</span></div>
          <div style="margin-top:18px;font-size:14px;color:#455c58">Due ${dueAt} UTC</div>
        </div>
        <table role="presentation" style="width:100%;margin:24px 0;border-collapse:collapse;font-size:13px;color:#455c58">
          <tr><td style="padding:8px 0;width:110px">Vendor</td><td style="padding:8px 0;font-family:monospace;word-break:break-all">${vendor}</td></tr>
          <tr><td style="padding:8px 0">Buyer wallet</td><td style="padding:8px 0;font-family:monospace;word-break:break-all">${buyer}</td></tr>
          <tr><td style="padding:8px 0">Invoice ID</td><td style="padding:8px 0;font-family:monospace;word-break:break-all">${invoiceId}</td></tr>
        </table>
        <a href="${invoiceUrl}" style="display:block;text-align:center;padding:15px 20px;border-radius:12px;background:#0c7d75;color:#fff;text-decoration:none;font-weight:700">Review and pay invoice</a>
        <p style="margin:20px 0 0;font-size:12px;line-height:1.6;color:#71827f">Sign in with the email address that received this message. Ma'at will restore the embedded buyer wallet assigned to this invoice.</p>
      </div>
      <div style="padding:15px 32px;background:#fff5dc;border-top:1px solid #eedda7;font-size:12px;color:#6b5722">Testnet preview. Use test USDC and test gas only. Do not send real funds.</div>
    </div>
  </body>
</html>`,
  }
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      })[character]!,
  )
}
