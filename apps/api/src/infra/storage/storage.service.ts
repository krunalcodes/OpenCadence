import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Inject, Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../../config/env";

const MISSING_BUCKET = new Set(["NotFound", "NoSuchBucket"]);
const MISSING_OBJECT = new Set(["NoSuchKey", "NotFound", "NoSuchBucket"]);
const BUCKET_PRESENT = new Set([
  "BucketAlreadyOwnedByYou",
  "BucketAlreadyExists",
]);

function errorCode(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return "UnknownError";
  }
  const { name, code } = error as { name?: unknown; code?: unknown };
  if (typeof name === "string" && name !== "" && name !== "Error") {
    return name;
  }
  return typeof code === "string" && code !== "" ? code : "UnknownError";
}

function storageError(action: string, error: unknown) {
  return new Error(`Storage could not ${action} (${errorCode(error)}).`);
}

@Injectable()
export class StorageService implements OnApplicationShutdown {
  private readonly client: S3Client;
  private readonly bucket: string;
  private bucketReady: Promise<void> | undefined;

  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    this.bucket = config.get("S3_BUCKET", { infer: true });
    this.client = new S3Client({
      endpoint: config.get("S3_ENDPOINT", { infer: true }),
      region: config.get("S3_REGION", { infer: true }),
      forcePathStyle: config.get("S3_FORCE_PATH_STYLE", { infer: true }),
      credentials: {
        accessKeyId: config.get("S3_ACCESS_KEY_ID", { infer: true }),
        secretAccessKey: config.get("S3_SECRET_ACCESS_KEY", { infer: true }),
      },
    });
  }

  ensureBucket(): Promise<void> {
    this.bucketReady ??= this.createBucketIfMissing().catch((error) => {
      this.bucketReady = undefined;
      throw error;
    });
    return this.bucketReady;
  }

  async putObject(
    key: string,
    body: Buffer | string,
    contentType: string,
  ): Promise<void> {
    await this.ensureBucket();
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    } catch (error) {
      throw storageError("write the object", error);
    }
  }

  async getObject(key: string): Promise<Buffer | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!response.Body) {
        return Buffer.alloc(0);
      }
      return Buffer.from(await response.Body.transformToByteArray());
    } catch (error) {
      if (MISSING_OBJECT.has(errorCode(error))) {
        return null;
      }
      throw storageError("read the object", error);
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (error) {
      if (MISSING_OBJECT.has(errorCode(error))) {
        return;
      }
      throw storageError("delete the object", error);
    }
  }

  onApplicationShutdown() {
    this.client.destroy();
  }

  private async createBucketIfMissing() {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return;
    } catch (error) {
      if (!MISSING_BUCKET.has(errorCode(error))) {
        throw storageError("check the bucket", error);
      }
    }
    try {
      await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
    } catch (error) {
      if (!BUCKET_PRESENT.has(errorCode(error))) {
        throw storageError("create the bucket", error);
      }
    }
  }
}
