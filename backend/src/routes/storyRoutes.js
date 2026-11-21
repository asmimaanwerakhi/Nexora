const express = require('express');
const authenticate = require('../middlewares/authenticate');
const { uploadMessageFile, validateMessageFile } = require('../middlewares/messageUpload');
const validate = require('../middlewares/validate');
const storyController = require('../controllers/storyController');
const { storySchema } = require('../validators/phase6Schemas');

const router = express.Router();

router.use(authenticate);
router.get('/', storyController.getFeed);
router.get('/mine', storyController.getMine);
router.post(
  '/',
  uploadMessageFile,
  validateMessageFile,
  validate(storySchema),
  storyController.createStory,
);
router.post('/:storyId/view', storyController.viewStory);
router.delete('/:storyId', storyController.deleteStory);

module.exports = router;
