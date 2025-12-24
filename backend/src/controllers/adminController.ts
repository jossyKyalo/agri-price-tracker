import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { query, transaction } from '../database/connection';
import { ApiError } from '../utils/apiError';
import { logger } from '../utils/logger';
import { sendEmail } from '../services/emailService';
import type { AdminRequest, CreateAdminRequest, ApiResponse, PaginationParams } from '../types/index';

export const createAdminRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { full_name, email, phone, region, organization, reason }: CreateAdminRequest = req.body;

    
    const existingRequest = await query(
      'SELECT id FROM admin_requests WHERE email = $1 AND status = $2',
      [email, 'pending']
    );

    if (existingRequest.rows.length > 0) {
      throw new ApiError('Admin request already exists for this email', 409);
    }

     
    const result = await query(
      `INSERT INTO admin_requests (full_name, email, phone, region, organization, reason)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, full_name, email, phone, region, organization, reason, status, created_at`,
      [full_name, email, phone, region, organization, reason]
    );

    logger.info(`New admin request created: ${email}`);
 
    const systemEmail = process.env.SYSTEM_EMAIL || 'agriculture.price.system@gmail.com';
    
    const emailText = `User ${full_name} (${organization}) has requested admin access.\nReason: ${reason}\n\nLog in to the dashboard to review.`;
    
    await sendEmail({
      to: systemEmail,
      subject: 'Action Required: New Admin Access Request',
      text: emailText,
      html: `<div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 5px;">
               <h2 style="color: #2d8a55;">New Admin Request</h2>
               <p><strong>User:</strong> ${full_name}</p>
               <p><strong>Organization:</strong> ${organization}</p>
               <p><strong>Email:</strong> ${email}</p>
               <p><strong>Reason:</strong> ${reason}</p>
               <hr/>
               <p><a href="http://localhost:4200/#" style="background-color: #2d8a55; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;">Go to Dashboard to Review</a></p>
             </div>`
    }); 
    const response: ApiResponse<AdminRequest> = {
      success: true,
      message: 'Admin request submitted successfully',
      data: result.rows[0]
    };

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
};

export const getAdminRequests = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { page = 1, limit = 10, status } = req.query as PaginationParams & { status?: string };
    const offset = (Number(page) - 1) * Number(limit);

    let whereClause = '';
    const queryParams: any[] = [limit, offset];

    if (status) {
      whereClause = 'WHERE status = $3';
      queryParams.push(status);
    }

    const result = await query(
      `SELECT ar.*, u.full_name as reviewed_by_name
       FROM admin_requests ar
       LEFT JOIN users u ON ar.reviewed_by = u.id
       ${whereClause}
       ORDER BY ar.created_at DESC
       LIMIT $1 OFFSET $2`,
      queryParams
    );

    const countResult = await query(
      status ? 'SELECT COUNT(*) FROM admin_requests WHERE status = $1' : 'SELECT COUNT(*) FROM admin_requests',
      status ? [status] : []
    );

    const total = parseInt(countResult.rows[0].count);
    const pages = Math.ceil(total / Number(limit));

    const response: ApiResponse<AdminRequest[]> = {
      success: true,
      message: 'Admin requests retrieved successfully',
      data: result.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const reviewAdminRequest = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    const reviewerId = req.user!.id;
 
    if (req.user?.role !== 'super_admin') {
       throw new ApiError('Access Denied. Only Super Admins can manage admin access.', 403);
    }

    await transaction(async (client) => { 
      const requestResult = await client.query(
        `UPDATE admin_requests 
         SET status = $1, reviewed_by = $2, reviewed_at = CURRENT_TIMESTAMP
         WHERE id = $3 AND status = 'pending'
         RETURNING *`,
        [status, reviewerId, id]
      );

      if (requestResult.rows.length === 0) {
        throw new ApiError('Admin request not found or already reviewed', 404);
      }

      const adminRequest = requestResult.rows[0];
 
      if (status === 'approved') {
        const tempPassword = Math.random().toString(36).slice(-8);
        const passwordHash = await bcrypt.hash(tempPassword, 12);
 
        const userCheck = await client.query('SELECT * FROM users WHERE email = $1', [adminRequest.email]);
        
        if (userCheck.rows.length > 0) { 
            await client.query(
                `UPDATE users SET role = 'admin', is_active = true WHERE email = $1`,
                [adminRequest.email]
            );
        } else { 
            await client.query(
            `INSERT INTO users (email, password_hash, full_name, phone, role, region, organization, is_active, email_verified)
                VALUES ($1, $2, $3, $4, 'admin', $5, $6, true, true)`,
            [
                adminRequest.email,
                passwordHash,
                adminRequest.full_name,
                adminRequest.phone,
                adminRequest.region,
                adminRequest.organization
            ]
            );
        }
 
        const approvedText = `Congratulations! Your request has been approved.\n\nLogin Email: ${adminRequest.email}\nTemporary Password: ${tempPassword}\n\nPlease change your password after logging in.`;
        
        await sendEmail({
            to: adminRequest.email,
            subject: 'AgriPrice Admin Access Approved',
            text: approvedText,
            html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
                     <h2 style="color: #2d8a55;">Welcome to AgriPrice!</h2>
                     <p>Your request for admin access has been approved.</p>
                     <div style="background: #f8f9fa; padding: 15px; border-radius: 5px;">
                       <p><strong>Email:</strong> ${adminRequest.email}</p>
                       <p><strong>Temporary Password:</strong> <code style="font-size: 1.2em;">${tempPassword}</code></p>
                     </div>
                     <p>Please change your password immediately after logging in.</p>
                     <a href="http://localhost:4200/#" style="background-color: #2d8a55; color: white; padding: 10px 15px; text-decoration: none; border-radius: 5px;">Login Now</a>
                   </div>`
        });
        
        logger.info(`Admin user created/updated: ${adminRequest.email}`);
        
      } else if (status === 'rejected') { 
          const rejectedText = `Your request for admin access has been reviewed and declined.\n\nReason: ${reason || 'Not specified'}`;
          
          await sendEmail({
              to: adminRequest.email,
              subject: 'AgriPrice Admin Access Update',
              text: rejectedText,
              html: `<div style="font-family: Arial, sans-serif; padding: 20px;">
                       <h2 style="color: #dc3545;">Access Request Update</h2>
                       <p>Your request for admin access has been reviewed and <strong>declined</strong>.</p>
                       <p><strong>Reason:</strong> ${reason || 'Administrative decision'}</p>
                     </div>`
          });
      }
    });

    logger.info(`Admin request ${status}: ${id} by ${req.user!.email}`);

    const response: ApiResponse = {
      success: true,
      message: `Admin request ${status} successfully`
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const getAdminStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const stats = await Promise.all([
      query('SELECT COUNT(*) FROM admin_requests WHERE status = $1', ['pending']),
      query('SELECT COUNT(*) FROM users WHERE role IN ($1, $2)', ['admin', 'super_admin']),
      query('SELECT COUNT(*) FROM price_entries WHERE DATE(created_at) = CURRENT_DATE'),
      query('SELECT COUNT(*) FROM sms_logs WHERE DATE(created_at) = CURRENT_DATE')
    ]);

    const response: ApiResponse = {
      success: true,
      message: 'Admin stats retrieved successfully',
      data: {
        pendingRequests: parseInt(stats[0].rows[0].count),
        totalAdmins: parseInt(stats[1].rows[0].count),
        todayEntries: parseInt(stats[2].rows[0].count),
        todaySms: parseInt(stats[3].rows[0].count)
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};

export const getSystemHealth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const dbCheck = await query('SELECT NOW()');
    const pendingSms = await query('SELECT COUNT(*) FROM sms_logs WHERE status = $1', ['pending']);
    const failedSms = await query('SELECT COUNT(*) FROM sms_logs WHERE status = $1', ['failed']);

    const response: ApiResponse = {
      success: true,
      message: 'System health retrieved successfully',
      data: {
        database: 'healthy',
        dbResponseTime: '< 100ms',
        pendingSms: parseInt(pendingSms.rows[0].count),
        failedSms: parseInt(failedSms.rows[0].count),
        lastCheck: dbCheck.rows[0].now
      }
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
};