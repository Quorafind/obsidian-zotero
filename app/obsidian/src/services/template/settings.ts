import { deleteKeys, keys, selectKeys } from "@mobily/ts-belt/Dict";
import { enumerate } from "@obzt/common";
import { assertNever } from "assert-never";
import { Eta } from "eta";
import Settings from "@/settings/base";
import ZoteroPlugin from "@/zt-main";
import annotation from "./defaults/zt-annot.ejs";
import annots from "./defaults/zt-annots.ejs";
import note from "./defaults/zt-note.ejs";
import type { FmFieldsMapping, FmMode } from "./frontmatter";
import { DEFAULT_FMFIELD_MAPPING } from "./frontmatter";
import { TemplateLoader } from "./loader";

export type EjectableTemplate = "note" | "annotation" | "annots";
export type NonEjectableTemplate = "filename" | "citation" | "altCitation";
export type TemplateType = EjectableTemplate | NonEjectableTemplate;

/**
 * render undefined/null in interpolate tag as empty string
 */
// const nullishAsEmptyString = {
//   processAST: (buffer: (string | { t: "i" | "e" | "r"; val: string })[]) => {
//     for (const b of buffer) {
//       if (typeof b === "string") continue;
//       if (b.t === "i" && b.val.startsWith("it.")) {
//         // undefined/null is rendered as empty string in favor of 'undefined'
//         b.val += '??""';
//       }
//     }
//     return buffer;
//   },
// };

export const acceptLineBreak = {
  processTemplate: (str: string) =>
    str.replace(/((?:[^\\]|^)(?:\\{2})*)\\n/g, "$1\n"),
};

export type EtaTrimConfig = "nl" | "slurp" | false;

export const defaultEtaConfig = {
  autoEscape: false,
  autoTrim: [false, false],
  filterFunction: (val: unknown): string => {
    if (typeof val === undefined || val === null) {
      return "";
    }
    return val as string;
  },
  plugins: [acceptLineBreak],
} satisfies Partial<Eta["config"]>;

interface SettingOptions {
  ejected: boolean;
  folder: string;
  templates: Record<NonEjectableTemplate, string>;
  fmFieldsMode: FmMode;
  fmFieldsMapping: FmFieldsMapping;
  fmTagPrefix: string;
  updateAnnotBlock: boolean;
  updateOverwrite: boolean;
  autoPairEta: boolean;
  autoTrim: [EtaTrimConfig, EtaTrimConfig];
}

type SettingOptionsJSON = Record<
  "template",
  Pick<SettingOptions, "ejected" | "folder" | "templates">
> &
  Omit<SettingOptions, "ejected" | "folder" | "templates">;

export const DEFAULT_TEMPLATE: Record<TemplateType, string> = {
  note,
  annots,
  annotation,
  filename: "<%= it.citekey ?? it.DOI ?? it.title ?? it.key %>.md",
  citation: "[@<%= it.citekey %>]",
  altCitation: "@<%= it.citekey %>",
};

export const TEMPLATE_FILES: Record<EjectableTemplate, string> = {
  note: "zt-note.eta.md",
  annotation: "zt-annot.eta.md",
  annots: "zt-annots.eta.md",
};

export const FILE_TEMPLATE_MAP: Record<string, EjectableTemplate> =
  Object.fromEntries(Object.entries(TEMPLATE_FILES).map((kv) => kv.reverse()));

export const ejectableTemplateTypes = keys(TEMPLATE_FILES),
  templateTypes = keys(DEFAULT_TEMPLATE),
  nonEjectableTemplateTypes = enumerate<NonEjectableTemplate>()(
    "filename",
    "citation",
    "altCitation",
  );

export class TemplateSettings extends Settings<SettingOptions> {
  eta = (() => {
    const eta = new Eta(defaultEtaConfig);
    // disable file resolution
    /** @ts-ignore */
    delete eta.readFile;
    /** @ts-ignore */
    delete eta.resolvePath;
    return eta;
  })();
  getDefaults() {
    return {
      ejected: false,
      folder: "ZtTemplates",
      templates: deleteKeys(DEFAULT_TEMPLATE, ejectableTemplateTypes),
      fmFieldsMode: "whitelist",
      fmFieldsMapping: {
        ...DEFAULT_FMFIELD_MAPPING,
      },
      fmTagPrefix: "",
      autoPairEta: false,
      updateAnnotBlock: false,
      updateOverwrite: false,
      autoTrim: defaultEtaConfig.autoTrim,
    } satisfies SettingOptions;
  }

  async setTemplate<K extends NonEjectableTemplate>(
    key: K,
    value: string,
  ): Promise<boolean> {
    if (this.templates[key] === value) return false;
    this.templates[key] = value;
    app.vault.trigger("zotero:template-updated", key);
    return true;
  }

  async apply(key: keyof SettingOptions): Promise<void> {
    const loader = this.use(TemplateLoader),
      plugin = this.use(ZoteroPlugin);
    switch (key) {
      case "ejected":
        return await loader.loadTemplates("eject");
      case "folder":
        // fully reload
        return await loader.loadTemplates("full");
      case "templates":
        return await loader.loadTemplates("noneject");
      case "fmFieldsMode":
      case "fmFieldsMapping":
      case "fmTagPrefix":
      case "updateAnnotBlock":
      case "updateOverwrite":
        return;
      case "autoPairEta":
        return plugin.templateEditor.setEtaBracketPairing(this.autoPairEta);
      case "autoTrim":
        this.eta.configure({ autoTrim: this.autoTrim });
        for (const type of templateTypes) {
          app.vault.trigger("zotero:template-updated", type);
        }
        return;
      default:
        assertNever(key);
    }
  }
  async applyAll() {
    const loader = this.use(TemplateLoader);
    await this.apply("autoPairEta");
    this.eta.configure({ autoTrim: this.autoTrim });
    await loader.loadTemplates("full");
  }

  toJSON(): SettingOptionsJSON {
    return {
      template: {
        ejected: this.ejected,
        folder: this.folder,
        templates: this.templates,
      },
      fmFieldsMode: this.fmFieldsMode,
      fmFieldsMapping: this.fmFieldsMapping,
      fmTagPrefix: this.fmTagPrefix,
      autoPairEta: this.autoPairEta,
      updateAnnotBlock: this.updateAnnotBlock,
      updateOverwrite: this.updateOverwrite,
      autoTrim: this.autoTrim,
    };
  }
  // fix compatibility with old settings format
  fromJSON(json: SettingOptionsJSON): void {
    super.fromJSON({
      ...(json.template ?? {}),
      ...selectKeys(json, [
        "autoPairEta",
        "fmFieldsMode",
        "fmFieldsMapping",
        "fmTagPrefix",
        "updateAnnotBlock",
        "updateOverwrite",
        "autoTrim",
      ]),
    });
  }
}
