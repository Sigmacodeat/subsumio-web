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
  it("has only Austrian cities active", () => {
    expect(getAllCitySlugs()).toEqual(
      expect.arrayContaining(["wien", "graz", "linz", "salzburg", "innsbruck"])
    );
    for (const slug of getAllCitySlugs()) {
      expect(getCityBySlug(slug)!.countryCode).toBe("AT");
    }
    expect(getCityBySlug("berlin")).toBeUndefined();
    expect(getCityBySlug("zuerich")).toBeUndefined();
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
      // No fake local-office claims — city pages describe the served
      // market, not a physical address (honest structured data).
      expect(city).not.toHaveProperty("geo");
      expect(city).not.toHaveProperty("address");
    }
  });

  it("city metaTitles are ≤ 60 characters", () => {
    for (const slug of getAllCitySlugs()) {
      const city = getCityBySlug(slug)!;
      expect(city.metaTitle.length).toBeLessThanOrEqual(60);
    }
  });
});
