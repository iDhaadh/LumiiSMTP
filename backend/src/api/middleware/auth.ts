import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../db/client';

export interface AuthRequest extends Request {
  userId: string;
  isAdmin: boolean;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const token = header.slice(7);

  // Try JWT first (dashboard sessions)
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET ?? 'secret') as { userId: string };
    const user = await prisma.user.findUnique({
      where: { id: payload.userId, isActive: true },
    });
    if (user) {
      (req as AuthRequest).userId = user.id;
      (req as AuthRequest).isAdmin = user.isAdmin;
      return next();
    }
  } catch {
    // Not a valid JWT — fall through to API key check
  }

  // Try API key (programmatic access)
  const keyHash = crypto.createHash('sha256').update(token).digest('hex');
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash, isActive: true },
    include: { user: true },
  });

  if (!apiKey || !apiKey.user.isActive) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  await prisma.apiKey.update({
    where: { id: apiKey.id },
    data: { lastUsed: new Date() },
  });

  (req as AuthRequest).userId = apiKey.userId;
  (req as AuthRequest).isAdmin = apiKey.user.isAdmin;
  next();
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!(req as AuthRequest).isAdmin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}
