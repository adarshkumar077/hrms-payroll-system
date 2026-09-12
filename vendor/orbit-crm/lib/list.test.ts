import { describe, it, expect } from "vitest";
import {
  parseListParams,
  pageInfo,
  orderByFrom,
  PAGE_SIZE,
  parseColumnFilters,
  columnFilterParamKeys,
  parsePageSize,
  parseVisibleColumns,
  currentParamsToJson,
  savedParamsToQuery,
  type ColumnFilterDef,
} from "@/lib/list";

describe("list", () => {
  describe("parseListParams", () => {
    it("returns defaults for empty input", () => {
      const result = parseListParams({});
      expect(result).toEqual({
        q: "",
        status: "",
        sort: "",
        order: "desc",
        page: 1,
        skip: 0,
        take: PAGE_SIZE,
      });
    });

    it("parses query parameter", () => {
      const result = parseListParams({ q: "search term" });
      expect(result.q).toBe("search term");
    });

    it("trims whitespace from query", () => {
      const result = parseListParams({ q: "  search  " });
      expect(result.q).toBe("search");
    });

    it("parses status parameter", () => {
      const result = parseListParams({ status: "active" });
      expect(result.status).toBe("active");
    });

    it("parses sort parameter", () => {
      const result = parseListParams({ sort: "created" });
      expect(result.sort).toBe("created");
    });

    it("defaults order to desc", () => {
      const result = parseListParams({});
      expect(result.order).toBe("desc");
    });

    it("respects order=asc", () => {
      const result = parseListParams({ order: "asc" });
      expect(result.order).toBe("asc");
    });

    it("defaults to desc for invalid order", () => {
      const result = parseListParams({ order: "invalid" });
      expect(result.order).toBe("desc");
    });

    it("parses page parameter", () => {
      const result = parseListParams({ page: "2" });
      expect(result.page).toBe(2);
    });

    it("calculates skip correctly: page 1 → skip 0", () => {
      const result = parseListParams({ page: "1" });
      expect(result.skip).toBe(0);
    });

    it("calculates skip correctly: page 3 → skip 2*PAGE_SIZE", () => {
      const result = parseListParams({ page: "3" });
      expect(result.skip).toBe(2 * PAGE_SIZE);
    });

    it("defaults to page 1 for invalid/missing page", () => {
      const result = parseListParams({ page: "invalid" });
      expect(result.page).toBe(1);
      const result2 = parseListParams({});
      expect(result2.page).toBe(1);
    });

    it("clamps negative page to 1", () => {
      const result = parseListParams({ page: "-5" });
      expect(result.page).toBe(1);
      expect(result.skip).toBe(0);
    });

    it("clamps page 0 to 1", () => {
      const result = parseListParams({ page: "0" });
      expect(result.page).toBe(1);
      expect(result.skip).toBe(0);
    });

    it("takes first element from array-valued params", () => {
      const result = parseListParams({
        q: ["first", "second"],
        status: ["active", "inactive"],
        order: ["asc", "desc"],
      });
      expect(result.q).toBe("first");
      expect(result.status).toBe("active");
      expect(result.order).toBe("asc");
    });

    it("sets take to PAGE_SIZE", () => {
      const result = parseListParams({});
      expect(result.take).toBe(PAGE_SIZE);
    });
  });

  describe("pageInfo", () => {
    it("calculates pages correctly: total 50, PAGE_SIZE 20 → 3 pages", () => {
      const result = pageInfo(50, 1);
      expect(result.pages).toBe(Math.ceil(50 / PAGE_SIZE));
    });

    it("returns pages minimum 1 for total 0", () => {
      const result = pageInfo(0, 1);
      expect(result.pages).toBe(1);
    });

    it("returns from=0 for total=0", () => {
      const result = pageInfo(0, 1);
      expect(result.from).toBe(0);
    });

    it("returns correct from/to for page 1", () => {
      const result = pageInfo(50, 1);
      expect(result.from).toBe(1);
      expect(result.to).toBe(PAGE_SIZE);
    });

    it("returns correct from/to for middle page (page 2 of 50)", () => {
      const result = pageInfo(50, 2);
      expect(result.from).toBe(PAGE_SIZE + 1);
      expect(result.to).toBe(2 * PAGE_SIZE);
    });

    it("returns correct from/to for last page with partial items", () => {
      const total = 55;
      const pages = Math.ceil(total / PAGE_SIZE);
      const result = pageInfo(total, pages);
      expect(result.from).toBe((pages - 1) * PAGE_SIZE + 1);
      expect(result.to).toBe(total);
    });

    it("includes total and page in result", () => {
      const result = pageInfo(100, 3);
      expect(result.total).toBe(100);
      expect(result.page).toBe(3);
    });
  });

  describe("orderByFrom", () => {
    it("returns field:order when field is in allow-list", () => {
      const allowed = ["created", "name", "updated"];
      const result = orderByFrom("name", "asc", allowed, { created: "desc" });
      expect(result).toEqual({ name: "asc" });
    });

    it("returns fallback when sort field not in allow-list", () => {
      const allowed = ["created", "name"];
      const fallback: Record<string, "asc" | "desc"> = { created: "desc" };
      const result = orderByFrom("invalid", "asc", allowed, fallback);
      expect(result).toEqual(fallback);
    });

    it("respects asc order when field is allowed", () => {
      const allowed = ["id", "status"];
      const result = orderByFrom("id", "asc", allowed, { status: "desc" });
      expect(result).toEqual({ id: "asc" });
    });

    it("respects desc order when field is allowed", () => {
      const allowed = ["id", "status"];
      const result = orderByFrom("id", "desc", allowed, { status: "asc" });
      expect(result).toEqual({ id: "desc" });
    });

    it("returns fallback for empty allow-list", () => {
      const fallback: Record<string, "asc" | "desc"> = { created: "desc" };
      const result = orderByFrom("name", "asc", [], fallback);
      expect(result).toEqual(fallback);
    });

    it("is case-sensitive for field matching", () => {
      const allowed = ["created", "name"];
      const fallback: Record<string, "asc" | "desc"> = { created: "desc" };
      const result = orderByFrom("Name", "asc", allowed, fallback);
      expect(result).toEqual(fallback);
    });
  });

  describe("pageInfo with custom size", () => {
    it("defaults to PAGE_SIZE when size is omitted (backward compat)", () => {
      const result = pageInfo(50, 1);
      expect(result.to).toBe(PAGE_SIZE);
    });

    it("uses the provided size for pages/from/to", () => {
      const result = pageInfo(95, 2, 10);
      expect(result.pages).toBe(10);
      expect(result.from).toBe(11);
      expect(result.to).toBe(20);
    });
  });

  describe("parseColumnFilters", () => {
    const defs: ColumnFilterDef[] = [
      { field: "name", kind: "text" },
      { field: "status", kind: "select" },
      { field: "createdAt", kind: "date" },
      { field: "score", kind: "number" },
    ];

    it("returns no fragments when nothing is set", () => {
      expect(parseColumnFilters({}, defs)).toEqual([]);
    });

    it("builds a `contains` fragment for a text filter", () => {
      const result = parseColumnFilters({ f_name: "acme" }, defs);
      expect(result).toContainEqual({ name: { contains: "acme" } });
    });

    it("ignores a blank/whitespace-only text filter", () => {
      expect(parseColumnFilters({ f_name: "   " }, defs)).toEqual([]);
    });

    it("builds an equality fragment for a select filter", () => {
      const result = parseColumnFilters({ f_status: "Qualified" }, defs);
      expect(result).toContainEqual({ status: "Qualified" });
    });

    it("builds a gte/lte range for a date filter with both bounds", () => {
      const result = parseColumnFilters({ f_createdAt_from: "2026-01-01", f_createdAt_to: "2026-01-31" }, defs);
      expect(result).toHaveLength(1);
      const frag = result[0].createdAt as { gte: Date; lte: Date };
      expect(frag.gte.toISOString().slice(0, 10)).toBe("2026-01-01");
      expect(frag.lte.toISOString().slice(0, 10)).toBe("2026-01-31");
    });

    it("builds a date filter with only a from bound", () => {
      const result = parseColumnFilters({ f_createdAt_from: "2026-01-01" }, defs);
      const frag = result[0].createdAt as { gte?: Date; lte?: Date };
      expect(frag.gte).toBeInstanceOf(Date);
      expect(frag.lte).toBeUndefined();
    });

    it("ignores an invalid date string", () => {
      expect(parseColumnFilters({ f_createdAt_from: "not-a-date" }, defs)).toEqual([]);
    });

    it("builds a min/max range for a number filter", () => {
      const result = parseColumnFilters({ f_score_min: "10", f_score_max: "90" }, defs);
      expect(result).toContainEqual({ score: { gte: 10, lte: 90 } });
    });

    it("ignores a non-numeric number filter value", () => {
      expect(parseColumnFilters({ f_score_min: "abc" }, defs)).toEqual([]);
    });

    it("combines multiple active filters into separate fragments", () => {
      const result = parseColumnFilters({ f_name: "acme", f_status: "New", f_score_min: "5" }, defs);
      expect(result).toHaveLength(3);
    });
  });

  describe("columnFilterParamKeys", () => {
    it("returns f_<field> for text/select kinds", () => {
      const keys = columnFilterParamKeys([
        { field: "name", kind: "text" },
        { field: "status", kind: "select" },
      ]);
      expect(keys).toEqual(["f_name", "f_status"]);
    });

    it("returns _from/_to for date and _min/_max for number", () => {
      const keys = columnFilterParamKeys([
        { field: "createdAt", kind: "date" },
        { field: "score", kind: "number" },
      ]);
      expect(keys).toEqual(["f_createdAt_from", "f_createdAt_to", "f_score_min", "f_score_max"]);
    });
  });

  describe("parsePageSize", () => {
    it("defaults to PAGE_SIZE when `per` is missing", () => {
      expect(parsePageSize({})).toBe(PAGE_SIZE);
    });

    it("accepts each allowed size", () => {
      for (const n of [10, 25, 50, 100]) {
        expect(parsePageSize({ per: String(n) })).toBe(n);
      }
    });

    it("falls back to PAGE_SIZE for a disallowed value", () => {
      expect(parsePageSize({ per: "17" })).toBe(PAGE_SIZE);
    });

    it("takes the first element of an array-valued `per`", () => {
      expect(parsePageSize({ per: ["25", "50"] })).toBe(25);
    });
  });

  describe("parseVisibleColumns", () => {
    const all = ["name", "company", "status", "score", "owner"];
    const def = ["name", "company", "status"];

    it("returns defaultColumns when `cols` is absent", () => {
      expect(parseVisibleColumns({}, all, def)).toEqual(def);
    });

    it("returns requested columns filtered to allColumns, in canonical order", () => {
      expect(parseVisibleColumns({ cols: "score,name" }, all, def)).toEqual(["name", "score"]);
    });

    it("drops unknown column keys", () => {
      expect(parseVisibleColumns({ cols: "name,bogus" }, all, def)).toEqual(["name"]);
    });

    it("falls back to defaultColumns when every requested key is invalid", () => {
      expect(parseVisibleColumns({ cols: "bogus,alsobogus" }, all, def)).toEqual(def);
    });
  });

  describe("currentParamsToJson / savedParamsToQuery round trip", () => {
    it("serializes only allowed, present keys", () => {
      const json = currentParamsToJson({ q: "acme", status: "New", page: "3", junk: "x" }, ["q", "status"]);
      expect(JSON.parse(json)).toEqual({ q: "acme", status: "New" });
    });

    it("omits empty/missing keys", () => {
      const json = currentParamsToJson({ q: "" }, ["q", "status"]);
      expect(JSON.parse(json)).toEqual({});
    });

    it("round-trips through savedParamsToQuery back into the same params", () => {
      const json = currentParamsToJson({ q: "acme corp", f_status: "New", per: "50" }, ["q", "f_status", "per"]);
      const qs = savedParamsToQuery(json);
      const parsed = Object.fromEntries(new URLSearchParams(qs.slice(1)));
      expect(parsed).toEqual({ q: "acme corp", f_status: "New", per: "50" });
    });

    it("returns bare `?` for an empty params object", () => {
      expect(savedParamsToQuery("{}")).toBe("?");
    });

    it("degrades to `?` for malformed JSON instead of throwing", () => {
      expect(savedParamsToQuery("not json")).toBe("?");
    });
  });
});
