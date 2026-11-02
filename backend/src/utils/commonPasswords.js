// shortcut: small deny-list of the most common passwords; swap for a HaveIBeenPwned k-anonymity check in production.
module.exports = new Set([
  '123456789012', 'password1234', 'password123!', 'qwertyuiop12', '1q2w3e4r5t6y', 'iloveyou1234',
  'administrator', 'welcome12345', 'letmein12345', 'passw0rd1234', 'password@123', 'qwerty123456',
  'abc123456789', 'changeme1234', 'football1234', 'monkey123456', 'sunshine1234', 'princess1234',
  'p@ssw0rd1234', 'admin1234567', 'trustno11234', 'dragon123456', 'baseball1234', 'superman1234',
  '111111111111', '000000000000', '123123123123', 'aaaaaaaaaaaa', 'password', 'passwordpassword',
  'qwertyqwerty', 'asdfghjkl123', 'zaq12wsxcde3', 'welcome@1234', 'nigeria12345', 'lagos1234567',
]);
