import { Router } from 'express';
import { getPublicStats } from '../controllers/statsController';

const router = Router();
 
router.get('/public', getPublicStats);

export default router;