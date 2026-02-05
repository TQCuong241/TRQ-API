import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port: port ? parseInt(port, 10) : 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass }
  });
}

export async function sendVerificationEmail(to: string, username: string, verifyUrl: string): Promise<boolean> {
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER || 'noreply@localhost';
  const transporter = getTransporter();

  const html = `
    <p>Xin chào <strong>${username}</strong>,</p>
    <p>Bạn đã đăng ký tài khoản. Vui lòng xác nhận email bằng cách nhấn vào link dưới đây:</p>
    <p><a href="${verifyUrl}" style="display:inline-block;padding:10px 20px;background:#38bdf8;color:#0f172a;text-decoration:none;border-radius:8px;">Xác nhận email</a></p>
    <p>Link xác nhận: <a href="${verifyUrl}">${verifyUrl}</a></p>
    <p>Link có hiệu lực trong 24 giờ.</p>
    <p>Nếu bạn không đăng ký, hãy bỏ qua email này.</p>
  `;

  if (transporter) {
    try {
      await transporter.sendMail({
        from,
        to,
        subject: 'Xác nhận đăng ký tài khoản',
        html
      });
      return true;
    } catch (err) {
      console.error('Gửi email xác nhận thất bại:', err);
      return false;
    }
  }

  console.log('--- Email xác nhận (chưa cấu hình SMTP) ---');
  console.log('Gửi đến:', to);
  console.log('Link xác nhận:', verifyUrl);
  console.log('--------------------------------------------');
  return true;
}

export async function sendLoginOtpEmail(to: string, username: string, otp: string): Promise<boolean> {
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER || 'noreply@localhost';
  const transporter = getTransporter();

  const html = `
    <p>Xin chào <strong>${username}</strong>,</p>
    <p>Bạn đang đăng nhập vào tài khoản. Mã OTP của bạn là:</p>
    <p style="font-size:32px;font-weight:bold;color:#38bdf8;text-align:center;letter-spacing:8px;padding:20px;background:#1e293b;border-radius:12px;margin:20px 0;">${otp}</p>
    <p>Mã OTP có hiệu lực trong 10 phút.</p>
    <p>Nếu bạn không yêu cầu đăng nhập, hãy bỏ qua email này.</p>
  `;

  if (transporter) {
    try {
      await transporter.sendMail({
        from,
        to,
        subject: 'Mã OTP đăng nhập',
        html
      });
      return true;
    } catch (err) {
      console.error('Gửi email OTP thất bại:', err);
      return false;
    }
  }

  console.log('--- Email OTP đăng nhập (chưa cấu hình SMTP) ---');
  console.log('Gửi đến:', to);
  console.log('Mã OTP:', otp);
  console.log('--------------------------------------------');
  return true;
}

export async function sendResetPasswordOtpEmail(to: string, username: string, otp: string): Promise<boolean> {
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER || 'noreply@localhost';
  const transporter = getTransporter();

  const html = `
    <p>Xin chào <strong>${username}</strong>,</p>
    <p>Bạn đã yêu cầu đặt lại mật khẩu. Mã OTP của bạn là:</p>
    <p style="font-size:32px;font-weight:bold;color:#38bdf8;text-align:center;letter-spacing:8px;padding:20px;background:#1e293b;border-radius:12px;margin:20px 0;">${otp}</p>
    <p>Mã OTP có hiệu lực trong 10 phút.</p>
    <p>Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.</p>
  `;

  if (transporter) {
    try {
      await transporter.sendMail({
        from,
        to,
        subject: 'Mã OTP đặt lại mật khẩu',
        html
      });
      return true;
    } catch (err) {
      console.error('Gửi email OTP đặt lại mật khẩu thất bại:', err);
      return false;
    }
  }

  console.log('--- Email OTP đặt lại mật khẩu (chưa cấu hình SMTP) ---');
  console.log('Gửi đến:', to);
  console.log('Mã OTP:', otp);
  console.log('--------------------------------------------');
  return true;
}

export async function sendChangePasswordOtpEmail(to: string, username: string, otp: string): Promise<boolean> {
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER || 'noreply@localhost';
  const transporter = getTransporter();

  const html = `
    <p>Xin chào <strong>${username}</strong>,</p>
    <p>Bạn đã yêu cầu đổi mật khẩu. Mã OTP của bạn là:</p>
    <p style="font-size:32px;font-weight:bold;color:#38bdf8;text-align:center;letter-spacing:8px;padding:20px;background:#1e293b;border-radius:12px;margin:20px 0;">${otp}</p>
    <p>Mã OTP có hiệu lực trong 10 phút.</p>
    <p>Nếu bạn không yêu cầu đổi mật khẩu, hãy bỏ qua email này.</p>
  `;

  if (transporter) {
    try {
      await transporter.sendMail({
        from,
        to,
        subject: 'Mã OTP đổi mật khẩu',
        html
      });
      return true;
    } catch (err) {
      console.error('Gửi email OTP đổi mật khẩu thất bại:', err);
      return false;
    }
  }

  console.log('--- Email OTP đổi mật khẩu (chưa cấu hình SMTP) ---');
  console.log('Gửi đến:', to);
  console.log('Mã OTP:', otp);
  console.log('--------------------------------------------');
  return true;
}

export { BASE_URL };
