import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { UserRole } from '@prisma/client';
import type { Request } from 'express';

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

export type AppRequest = Request & {
  user?: AuthenticatedUser;
  sessionToken?: string;
};

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<AppRequest>();
  return request.user;
});

/** Client IP; relies on Express `trust proxy` (TRUST_PROXY=true) when running behind a load balancer. */
export function clientIp(request: Request): string {
  return request.ip || request.socket.remoteAddress || 'unknown';
}
