import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}

  async createReport(
    userId: string,
    input: {
      type?: string;
      subject?: string;
      description?: string;
      screenshotLabel?: string;
    },
  ) {
    const type = input.type?.trim();
    const subject = input.subject?.trim();
    const description = input.description?.trim();
    const screenshotLabel = input.screenshotLabel?.trim();

    if (!type || !subject || !description) {
      throw new BadRequestException('Completa tipo, asunto y descripcion');
    }

    if (subject.length > 160) {
      throw new BadRequestException('El asunto es demasiado largo');
    }

    if (description.length > 1000) {
      throw new BadRequestException('La descripcion no debe superar 1000 caracteres');
    }

    const report = await this.prisma.supportReport.create({
      data: {
        userId,
        type,
        subject,
        description,
        screenshotLabel: screenshotLabel || null,
      },
    });

    return {
      message: 'Reporte enviado correctamente',
      reportId: report.id,
    };
  }
}
