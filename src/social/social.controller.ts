import {
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { SocialService } from './social.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  @Get('profile/me/friends')
  getMyProfileFriends(@CurrentUser() user: AuthenticatedUser) {
    return this.socialService.listFriends(user.id);
  }

  @Get('social/friends')
  getMyFriends(@CurrentUser() user: AuthenticatedUser) {
    return this.socialService.listFriends(user.id);
  }

  @Get('social/friends/requests')
  getMyRequests(@CurrentUser() user: AuthenticatedUser) {
    return this.socialService.listRequests(user.id);
  }

  @Post('social/friends/:userId/request')
  requestFriend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') targetUserId: string,
  ) {
    return this.socialService.requestFriend(user.id, targetUserId);
  }

  @Patch('social/friends/:friendshipId/accept')
  acceptRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('friendshipId') friendshipId: string,
  ) {
    return this.socialService.acceptRequest(user.id, friendshipId);
  }

  @Patch('social/friends/:friendshipId/reject')
  rejectRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('friendshipId') friendshipId: string,
  ) {
    return this.socialService.rejectRequest(user.id, friendshipId);
  }

  @Post('social/friends/:userId/block')
  blockUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') targetUserId: string,
  ) {
    return this.socialService.blockUser(user.id, targetUserId);
  }

  @Delete('social/friends/:userId')
  removeFriend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') targetUserId: string,
  ) {
    return this.socialService.removeConnection(user.id, targetUserId);
  }
}
