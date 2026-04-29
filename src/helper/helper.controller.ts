import { Controller, Get } from '@nestjs/common';
import { HelperService } from './helper.service';

@Controller('helper')
export class HelperController {
  constructor(private helperService: HelperService) {}

  @Get('/find-tracks')
  getTracks() {
    return this.helperService.getTracks();
  }
}
