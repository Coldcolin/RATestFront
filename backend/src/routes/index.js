const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const { authLimiter } = require('../middleware/rateLimit');
const { uploadSingle } = require('../middleware/upload');
const auth = require('../controllers/authController');
const profile = require('../controllers/profileController');
const documents = require('../controllers/documentController');
const review = require('../controllers/reviewController');
const admin = require('../controllers/adminController');
const notifications = require('../controllers/notificationController');

const router = Router();
const executive = [requireAuth, requireRole('executive')];
const reviewer = [requireAuth, requireRole('consultant', 'admin')];
const adminOnly = [requireAuth, requireRole('admin')];

router.get('/health', (req, res) => res.json({ ok: true }));

router.post('/auth/register', authLimiter, auth.register);
router.post('/auth/login', authLimiter, auth.login);
router.post('/auth/logout', auth.logout);
router.get('/auth/me', requireAuth, auth.me);

router.get('/profile/me', executive, profile.getMine);
router.put('/profile/me/step/:step', executive, profile.saveStep);
router.post('/profile/me/submit', executive, profile.submit);
router.get('/profile/me/export', executive, profile.exportMine);
router.post('/profile/me/delete-request', executive, authLimiter, profile.requestDeletion);

router.post('/documents', executive, uploadSingle, documents.upload);
router.get('/documents/:id/file', requireAuth, requireRole('executive', 'consultant', 'admin'), documents.download);
router.delete('/documents/:id', executive, documents.remove);

router.get('/review/queue', reviewer, review.queue);
router.get('/review/:profileId', reviewer, review.detail);
router.post('/review/:profileId/status', reviewer, review.changeStatus);

router.get('/notifications', requireAuth, notifications.list);
router.patch('/notifications/:id/read', requireAuth, notifications.markRead);
router.post('/push/subscribe', requireAuth, notifications.subscribe);

router.get('/audit', adminOnly, admin.listAudit);
router.get('/audit/verify', adminOnly, admin.verifyAudit);

router.get('/admin/users', adminOnly, admin.listUsers);
router.patch('/admin/users/:id/role', adminOnly, admin.changeRole);
router.patch('/admin/users/:id/active', adminOnly, admin.changeActive);

module.exports = router;
