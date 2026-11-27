/** Branded login-OTP email (HTML + plain text). Values are escaped; the code is digits only. */

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function otpEmail(opts: {
  code: string;
  expiresInMinutes: number;
  employeeName?: string | null;
  supportContact?: string | null;
}) {
  const code = opts.code.replace(/\D/g, '');
  const name = opts.employeeName?.trim() ? esc(opts.employeeName.trim()) : 'there';
  const support = opts.supportContact?.trim()
    ? esc(opts.supportContact.trim())
    : 'your HR department';
  const subject = `Your EITF HRMS login code: ${code}`;

  const text = [
    `Hello ${opts.employeeName?.trim() || 'there'},`,
    '',
    'Use this one-time code to sign in to EITF HRMS & Payroll:',
    '',
    `    ${code}`,
    '',
    `The code expires in ${opts.expiresInMinutes} minutes and can be used only once.`,
    '',
    'Security: never share this code with anyone. EITF staff will never ask you for it.',
    'If you did not try to sign in, ignore this email and inform HR.',
    '',
    `Need help? Contact ${opts.supportContact?.trim() || 'your HR department'}.`,
    '',
    'EITF – Enhancing IT Infrastructure Pvt. Ltd.',
  ].join('\n');

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f6fb;font-family:Segoe UI,Arial,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
<tr><td style="background:#1e3a8a;padding:18px 24px;color:#ffffff">
  <div style="font-size:20px;font-weight:700;letter-spacing:.5px">EITF</div>
  <div style="font-size:12px;opacity:.9">Enhancing IT Infrastructure Pvt. Ltd. · HRMS &amp; Payroll</div>
</td></tr>
<tr><td style="padding:24px">
  <p style="margin:0 0 12px;font-size:15px">Hello ${name},</p>
  <p style="margin:0 0 16px;font-size:15px">Use this one-time code to sign in to <strong>EITF HRMS &amp; Payroll</strong>:</p>
  <div style="text-align:center;margin:20px 0">
    <span style="display:inline-block;font-family:Consolas,Menlo,monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#1e3a8a;background:#eef2ff;border-radius:10px;padding:12px 20px">${code}</span>
  </div>
  <p style="margin:0 0 16px;font-size:14px;color:#374151">The code expires in <strong>${opts.expiresInMinutes} minutes</strong> and can be used only once.</p>
  <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:12px 14px;font-size:13px;color:#9a3412">
    <strong>Security warning:</strong> never share this code with anyone. EITF staff will never ask you for it.
    If you did not try to sign in, ignore this email and inform HR.
  </div>
  <p style="margin:16px 0 0;font-size:13px;color:#6b7280">Need help? Contact ${support}.</p>
</td></tr>
<tr><td style="padding:12px 24px;background:#f9fafb;font-size:11px;color:#9ca3af">This is an automated message from EITF HRMS. Please do not reply.</td></tr>
</table></td></tr></table></body></html>`;

  return { subject, text, html };
}
