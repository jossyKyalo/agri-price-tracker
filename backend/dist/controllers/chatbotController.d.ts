import { Request, Response, NextFunction } from 'express';
export declare const sendMessage: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getConversation: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getUserConversations: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const deleteConversation: (req: Request, res: Response, next: NextFunction) => Promise<void>;
export declare const getChatStats: (req: Request, res: Response, next: NextFunction) => Promise<void>;
//# sourceMappingURL=chatbotController.d.ts.map