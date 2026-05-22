const sendEmail = async ({ to, subject, html, text }) => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'VirtualTrade <onboarding@resend.dev>';

  if (!apiKey) {
    console.log(`[Email fallback] To: ${to} | Subject: ${subject}`);
    if (text) console.log(text);
    return { sent: false, fallback: true };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ from, to: [to], subject, html, text })
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Resend API error:', err);
      return { sent: false, fallback: true, error: err };
    }

    return { sent: true };
  } catch (err) {
    console.error('Email send error:', err.message);
    console.log(`[Email fallback] To: ${to} | Subject: ${subject}`);
    if (text) console.log(text);
    return { sent: false, fallback: true };
  }
};

const sendOTPEmail = async (email, otp, purpose) => {
  const purposeLabels = {
    verification: 'Email Verification',
    password_reset: 'Password Reset'
  };
  const label = purposeLabels[purpose] || 'Verification';
  const subject = `VirtualTrade — ${label} OTP`;
  const text = `Your OTP for ${label} is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you did not request this, ignore this email.`;
  const html = [
    '<div style="font-family:sans-serif;max-width:480px;margin:0 auto">',
    '<h2 style="color:#3b82f6">VirtualTrade</h2>',
    `<p>Your OTP for <strong>${label}</strong>:</p>`,
    `<p style="font-size:32px;letter-spacing:8px;font-weight:bold">${otp}</p>`,
    '<p style="color:#666;font-size:14px">Expires in 10 minutes. Do not share this code.</p>',
    '<hr style="border:none;border-top:1px solid #eee;margin:24px 0"/>',
    '<p style="color:#999;font-size:12px">Paper trading simulation for educational purposes only.</p>',
    '</div>'
  ].join('');

  return sendEmail({ to: email, subject, text, html });
};

module.exports = { sendEmail, sendOTPEmail };
