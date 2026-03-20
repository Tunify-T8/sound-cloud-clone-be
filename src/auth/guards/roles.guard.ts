import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserType } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // 1. Get required roles from route metadata
    const requiredRoles = this.reflector.getAllAndOverride<UserType[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 2. No @Roles() decorator → route only needs authentication, not a specific role
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    // 3. Get user from request — attached by JwtAccessGuard
    const { user } = context.switchToHttp().getRequest();

    // 4. Apply role hierarchy
    // ADMIN can do everything
    if (user.role === UserType.ADMIN) {
      return true;
    }

    // ARTIST can do ARTIST-level things
    if (requiredRoles.includes(UserType.ARTIST) && user.role === UserType.ARTIST) {
      return true;
    }

    // Role doesn't match
    throw new ForbiddenException(
      'You do not have permission to access this resource',
    );
  }
}