import { eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { user } from "../../db/schema/auth.js";
import { sectors, userSectors } from "../../db/schema/sectors.js";

export const adminRepository = {
  async listUsers() {
    const users = await db
      .select({ id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt })
      .from(user)
      .orderBy(user.name);

    const memberships = await db
      .select({ userId: userSectors.userId, sectorId: sectors.id, sectorName: sectors.name, sectorSlug: sectors.slug, membershipRole: userSectors.role })
      .from(userSectors)
      .innerJoin(sectors, eq(sectors.id, userSectors.sectorId));

    return users.map((account) => ({
      ...account,
      memberships: memberships.filter((membership) => membership.userId === account.id).map(({ userId: _userId, ...membership }) => membership),
    }));
  },

  async updateRole(userId: string, role: "user" | "admin") {
    await db.update(user).set({ role }).where(eq(user.id, userId));
  },
};
