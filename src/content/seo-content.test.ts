import { describe, it, expect } from "vitest";
import { BLOG_POSTS, getAllPosts, getPostBySlug } from "./blog";
import { CITIES, getCityBySlug, getAllCitySlugs } from "./city-pages";

describe("Blog Content", () => {
  it("has at least 3 blog posts", () => {
    expect(BLOG_POSTS.length).toBeGreaterThanOrEqual(3);
  });

  it("every post has required fields", () => {
    for (const post of BLOG_POSTS) {
      expect(post.slug).toBeTruthy();
      expect(post.title).toBeTruthy();
      expect(post.description).toBeTruthy();
      expect(post.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(post.author).toBeTruthy();
      expect(post.tags.length).toBeGreaterThan(0);
      expect(post.content.length).toBeGreaterThan(0);
    }
  });

  it("getAllPosts returns sorted by date descending", () => {
    const posts = getAllPosts();
    for (let i = 1; i < posts.length; i++) {
      expect(posts[i - 1].date.localeCompare(posts[i].date)).toBeGreaterThanOrEqual(0);
    }
  });

  it("getPostBySlug finds existing and rejects unknown", () => {
    const first = BLOG_POSTS[0];
    expect(getPostBySlug(first.slug)).toBeDefined();
    expect(getPostBySlug("nonexistent-slug")).toBeUndefined();
  });
});

describe("City Pages Content", () => {
  it("has 3 cities: Wien, Berlin, Zürich", () => {
    expect(Object.keys(CITIES).length).toBe(3);
    expect(getCityBySlug("wien")).toBeDefined();
    expect(getCityBySlug("berlin")).toBeDefined();
    expect(getCityBySlug("zuerich")).toBeDefined();
  });

  it("every city has required fields", () => {
    for (const slug of getAllCitySlugs()) {
      const city = getCityBySlug(slug)!;
      expect(city.city).toBeTruthy();
      expect(city.country).toBeTruthy();
      expect(city.countryCode).toMatch(/^[A-Z]{2}$/);
      expect(city.metaTitle).toBeTruthy();
      expect(city.metaDesc).toBeTruthy();
      expect(city.h1).toBeTruthy();
      expect(city.intro).toBeTruthy();
      expect(city.jurisdictionNote).toBeTruthy();
      expect(city.courts.length).toBeGreaterThan(0);
      expect(city.features.length).toBeGreaterThan(0);
      expect(city.faq.length).toBeGreaterThan(0);
      expect(typeof city.geo.lat).toBe("number");
      expect(typeof city.geo.lng).toBe("number");
      expect(city.address.street).toBeTruthy();
      expect(city.address.postalCode).toBeTruthy();
    }
  });

  it("city metaTitles are ≤ 60 characters", () => {
    for (const slug of getAllCitySlugs()) {
      const city = getCityBySlug(slug)!;
      expect(city.metaTitle.length).toBeLessThanOrEqual(60);
    }
  });
});
