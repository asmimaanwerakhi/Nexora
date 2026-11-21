const express = require('express');
const authenticate = require('../middlewares/authenticate');
const callController = require('../controllers/callController');

const router = express.Router();

router.get('/', authenticate, callController.getCallHistory);

module.exports = router;
