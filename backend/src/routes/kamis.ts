import { Router } from 'express';
import multer from 'multer';
import { 
    triggerKamisSync, 
    uploadKamisData, 
    getKamisStatus, 
    getKamisLogs 
} from '../controllers/kamisController';
import { authenticate, requireAdmin } from '../middleware/auth'; 

const router = Router();
 
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }  
});
 
router.use(authenticate);

router.use(requireAdmin);

 
router.post('/upload', upload.single('file'), uploadKamisData);
 
router.post('/sync', triggerKamisSync);
 
router.get('/status', getKamisStatus); 

router.get('/logs', getKamisLogs);

export default router;