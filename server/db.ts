import { eq, and, desc, asc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, contentProjects, projectAssets, type InsertContentProject, type InsertProjectAsset } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ===== 프로젝트 관리 =====

export async function createProject(data: InsertContentProject) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(contentProjects).values(data);
  return result[0].insertId;
}

export async function getProjectsByUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(contentProjects).where(eq(contentProjects.userId, userId)).orderBy(desc(contentProjects.updatedAt));
}

export async function getProjectById(projectId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(contentProjects).where(and(eq(contentProjects.id, projectId), eq(contentProjects.userId, userId))).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateProject(projectId: number, userId: number, data: Partial<Pick<InsertContentProject, 'name' | 'description'>>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(contentProjects).set(data).where(and(eq(contentProjects.id, projectId), eq(contentProjects.userId, userId)));
}

export async function deleteProject(projectId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(projectAssets).where(and(eq(projectAssets.projectId, projectId), eq(projectAssets.userId, userId)));
  await db.delete(contentProjects).where(and(eq(contentProjects.id, projectId), eq(contentProjects.userId, userId)));
}

// ===== 프로젝트 에셋 =====

export async function addProjectAsset(data: InsertProjectAsset) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(projectAssets).values(data);
  return result[0].insertId;
}

export async function getProjectAssets(projectId: number, userId: number, category?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(projectAssets.projectId, projectId), eq(projectAssets.userId, userId)];
  if (category) conditions.push(eq(projectAssets.category, category));
  return db.select().from(projectAssets).where(and(...conditions)).orderBy(asc(projectAssets.sortOrder), desc(projectAssets.createdAt));
}

export async function updateProjectAsset(assetId: number, userId: number, data: Partial<Pick<InsertProjectAsset, 'label' | 'sortOrder'>>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(projectAssets).set(data).where(and(eq(projectAssets.id, assetId), eq(projectAssets.userId, userId)));
}

export async function deleteProjectAsset(assetId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.select().from(projectAssets).where(and(eq(projectAssets.id, assetId), eq(projectAssets.userId, userId))).limit(1);
  await db.delete(projectAssets).where(and(eq(projectAssets.id, assetId), eq(projectAssets.userId, userId)));
  return result.length > 0 ? result[0] : undefined;
}
