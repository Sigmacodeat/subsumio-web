// @vitest-environment node
// Native shell configuration the store review and the data protection depend on.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf-8");

function plistString(plist: string, key: string): string | null {
  const m = plist.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`));
  return m ? m[1] : null;
}

describe("iOS Info.plist", () => {
  const plist = read("ios/App/App/Info.plist");

  it.each([
    "NSCameraUsageDescription",
    "NSPhotoLibraryUsageDescription",
    "NSFaceIDUsageDescription",
  ])("declares %s with a German purpose text", (key) => {
    const text = plistString(plist, key);
    expect(text).toBeTruthy();
    expect(text).toMatch(/Subsumio/);
  });
});

describe("Android manifest", () => {
  const manifest = read("android/app/src/main/AndroidManifest.xml");

  it("keeps app data out of device and cloud backups", () => {
    expect(manifest).toContain('android:allowBackup="false"');
    expect(manifest).toContain('android:fullBackupContent="@xml/backup_rules"');
    expect(manifest).toContain('android:dataExtractionRules="@xml/data_extraction_rules"');
    const rules = read("android/app/src/main/res/xml/data_extraction_rules.xml");
    expect(rules).toMatch(/<cloud-backup>[\s\S]*<exclude domain="root"/);
    expect(rules).toMatch(/<device-transfer>[\s\S]*<exclude domain="root"/);
    expect(read("android/app/src/main/res/xml/backup_rules.xml")).toContain(
      '<exclude domain="root" path="." />'
    );
  });
});
