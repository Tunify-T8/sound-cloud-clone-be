import { Controller, Get } from '@nestjs/common';

@Controller('users')
export class UsersController {
  // constructor(private usersService: usersService )
  // ─── GET /users/me ───────────────────────────────────────
  //gets the user profile
  @Get('me')
  myProfile() {}
}
