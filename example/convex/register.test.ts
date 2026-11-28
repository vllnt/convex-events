import { convexTest } from "convex-test";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { register } from "../../src/test";

/** A host schema with its own table, unlike the example app's empty schema. */
const hostSchema = defineSchema({
  notes: defineTable({ body: v.string() }),
});

const modules = import.meta.glob("./**/*.ts");

test("register accepts a convexTest instance built from a host schema with its own tables", async () => {
  const t = convexTest(hostSchema, modules);
  register(t);

  await t.run(async (ctx) => {
    await ctx.db.insert("notes", { body: "host row" });
  });
  await t.mutation(api.example.record, { subjectRef: "s", type: "created" });

  const events = await t.query(api.example.list, { subjectRef: "s" });
  expect(events.map((event) => event.type)).toEqual(["created"]);
  const notes = await t.run((ctx) => ctx.db.query("notes").collect());
  expect(notes.map((note) => note.body)).toEqual(["host row"]);
});
