import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/index.js";
import { sectors, userSectors } from "../../db/schema/sectors.js";

export const sectorRepository = {
  async findAll() {
    return db.select({ id: sectors.id, slug: sectors.slug, name: sectors.name }).from(sectors).orderBy(sectors.name);
  },

  async findByIds(ids: string[]) {
    if (ids.length === 0) return [];
    return db.select({ id: sectors.id, slug: sectors.slug, name: sectors.name }).from(sectors).where(inArray(sectors.id, ids));
  },

  async findForUser(userId: string) {
    return db
      .select({ id: sectors.id, slug: sectors.slug, name: sectors.name, role: userSectors.role })
      .from(userSectors)
      .innerJoin(sectors, eq(sectors.id, userSectors.sectorId))
      .where(eq(userSectors.userId, userId))
      .orderBy(sectors.name);
  },

  async isMember(userId: string, sectorId: string) {
    const membership = await db.query.userSectors.findFirst({
      where: and(eq(userSectors.userId, userId), eq(userSectors.sectorId, sectorId)),
    });
    return Boolean(membership);
  },

  async addMember(userId: string, sectorId: string, role: "member" | "editor" | "admin") {
    await db.insert(userSectors).values({ userId, sectorId, role }).onConflictDoUpdate({
      target: [userSectors.userId, userSectors.sectorId],
      set: { role },
    });
  },

  async removeMember(userId: string, sectorId: string) {
    await db.delete(userSectors).where(and(eq(userSectors.userId, userId), eq(userSectors.sectorId, sectorId)));
  },
};
