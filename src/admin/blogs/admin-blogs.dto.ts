import { IsOptional, IsString, IsNotEmpty, MaxLength, Matches } from 'class-validator';

export class CreateBlogDto {
  @IsString() @IsNotEmpty() @MaxLength(220) title!: string;
  @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(160) slug!: string;
  @IsOptional() @IsString() @MaxLength(3000) excerpt?: string;
  @IsOptional() @IsString() @MaxLength(200000) contentHtml?: string;
  @IsOptional() @IsString() @MaxLength(1024) @Matches(/^(?:$|\/(?!\/)[a-zA-Z0-9._~/%-]+|https:\/\/www\.pgoapp\.com\/[a-zA-Z0-9._~/%-]+)$/) coverImageUrl?: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsString() @MaxLength(220) seoTitle?: string;
  @IsOptional() @IsString() @MaxLength(500) seoDescription?: string;
  @IsOptional() @IsString() @MaxLength(140) primaryKeyword?: string;
}

export class UpdateBlogDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(220) title?: string;
  @IsOptional() @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) @MaxLength(160) slug?: string;
  @IsOptional() @IsString() @MaxLength(3000) excerpt?: string;
  @IsOptional() @IsString() @MaxLength(200000) contentHtml?: string;
  @IsOptional() @IsString() @MaxLength(1024) @Matches(/^(?:$|\/(?!\/)[a-zA-Z0-9._~/%-]+|https:\/\/www\.pgoapp\.com\/[a-zA-Z0-9._~/%-]+)$/) coverImageUrl?: string;
  @IsOptional() @IsString() @MaxLength(100) category?: string;
  @IsOptional() @IsString() @MaxLength(220) seoTitle?: string;
  @IsOptional() @IsString() @MaxLength(500) seoDescription?: string;
  @IsOptional() @IsString() @MaxLength(140) primaryKeyword?: string;
}
