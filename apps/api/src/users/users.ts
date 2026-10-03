import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import * as argon2 from 'argon2';
import { AdminOnly, SessionGuard } from '../auth/session.guard';
import { passwordMinLength } from '../auth/auth.dto';
import { CurrentUser, type AuthenticatedUser } from '../common/request';
import { PrismaService } from '../prisma/prisma.service';
import { isUniqueViolation } from '../common/db-errors';
import { NotificationsService } from '../email/notifications.service';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

class CreateUserDto {
  @Transform(trim) @IsEmail() @MaxLength(254) email: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsEnum(UserRole) role: UserRole;
  @IsString() @MinLength(passwordMinLength) @MaxLength(200) password: string;
}

class UpdateUserDto {
  @IsOptional() @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class ResetPasswordDto {
  @IsString() @MinLength(passwordMinLength) @MaxLength(200) password: string;
}

const userSelect = { id: true, email: true, name: true, role: true, isActive: true, createdAt: true } as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  list() {
    return this.prisma.user.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }], select: userSelect });
  }

  /** Lightweight list any staff member can use, e.g. to pick a listing's host. */
  staffDirectory() {
    return this.prisma.user.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } });
  }

  async create(dto: CreateUserDto, invitedBy: string) {
    try {
      const user = await this.prisma.user.create({
        data: { email: dto.email.toLowerCase(), name: dto.name, role: dto.role, passwordHash: await argon2.hash(dto.password) },
        select: userSelect,
      });
      await this.notifications.staffWelcome(user, invitedBy);
      return user;
    } catch (error) {
      if (isUniqueViolation(error, 'email')) throw new ConflictException('A staff account with that email already exists.');
      throw error;
    }
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateUserDto) {
    if (actor.id === id && (dto.isActive === false || (dto.role && dto.role !== UserRole.ADMIN))) {
      throw new BadRequestException('You cannot deactivate or demote your own account.');
    }
    const user = await this.prisma.user.update({ where: { id }, data: dto, select: userSelect }).catch(() => null);
    if (!user) throw new NotFoundException('User not found.');
    if (dto.isActive === false) await this.prisma.session.deleteMany({ where: { userId: id } });
    return user;
  }

  async resetPassword(id: string, password: string) {
    const passwordHash = await argon2.hash(password);
    const updated = await this.prisma.user.updateMany({ where: { id }, data: { passwordHash } });
    if (!updated.count) throw new NotFoundException('User not found.');
    await this.prisma.session.deleteMany({ where: { userId: id } });
  }
}

@Controller('admin')
@UseGuards(SessionGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('staff')
  directory() {
    return this.users.staffDirectory();
  }

  @Get('users')
  @AdminOnly()
  list() {
    return this.users.list();
  }

  @Post('users')
  @AdminOnly()
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.users.create(dto, actor.name);
  }

  @Patch('users/:id')
  @AdminOnly()
  update(@CurrentUser() actor: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.users.update(actor, id, dto);
  }

  @Post('users/:id/password')
  @AdminOnly()
  @HttpCode(204)
  async resetPassword(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ResetPasswordDto) {
    await this.users.resetPassword(id, dto.password);
  }
}

@Module({
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
