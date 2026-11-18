import { type Scope, type Seal, type Seals, verified } from "./signatures.js";

export interface Author {
  name: string;
  key: string;
}
export interface Grant extends Author {
  scope: Scope;
  digest?: string;
}
export interface ContentPrompt {
  message: string;
  detail?: string;
  fingerprint?: string;
  buttons: string[];
  cancelId: number;
}

export interface TrustPrompt {
  message: string;
  detail: string;
  buttons: string[];
  key?: string;
}
export interface TrustDevice {
  identity(): Promise<Author>;
  sign(scope: Scope, digest: string, author: Author): Promise<Seal>;
  grants(): Promise<Grant[]>;
  grant(value: Grant): Promise<void>;
  ask(prompt: TrustPrompt): Promise<number>;
}
interface Origin {
  digest?: string;
  seal?: Seal;
  invalid: boolean;
}

/** Per open drawing. Approval and publication are independent decisions. */
export class ContentTrust {
  private origins: Partial<Record<Scope, Origin>> = {};
  constructor(private device: TrustDevice) {}
  async load(scope: Scope, digest: string | undefined, seals: Seals): Promise<void> {
    const seal = seals[scope];
    this.origins[scope] = {
      digest,
      seal,
      invalid: Object.hasOwn(seals, scope) && !(await verified(scope, digest, seal)),
    };
  }
  async authorize(scope: Scope, digest: string): Promise<"allow" | "empty" | "deny"> {
    const origin = this.origins[scope];
    const workspace = scope === "workspace";
    if (origin?.invalid) {
      const choice = await this.device.ask({
        message: "Signature verification failed",
        detail: `The embedded ${scope} may have changed or been damaged. It will stay disabled.`,
        buttons: workspace ? ["Cancel", "Start with an empty workspace"] : ["OK"],
      });
      return workspace && choice === 1 ? "empty" : "deny";
    }
    const seal = origin?.digest === digest ? origin.seal : undefined;
    const key = seal?.key ?? "";
    const grants = await this.device.grants();
    if (
      grants.some(
        (g) => g.key === key && g.scope === scope && (g.digest === digest || (!!key && !g.digest)),
      )
    )
      return "allow";
    const buttons = ["Cancel", "Trust this version"];
    if (seal) buttons.push(`Always trust this author for ${scope}`);
    if (workspace) buttons.push("Start with an empty workspace");
    const choice = await this.device.ask({
      key: seal?.key,
      message: workspace
        ? "Use the included agent workspace?"
        : "Allow embedded custom decorators?",
      detail: [
        seal
          ? `Signed by ${seal.name}. Anyone can choose that name. Compare the fingerprint with the one the author published.`
          : "This content is unsigned.",
        workspace
          ? "Included instructions, scripts, and conversations can influence the agent and the actions it takes with your permissions. An empty workspace replaces the included files in this drawing when you save."
          : "Custom decorators run embedded code and can change exported geometry. Cancel to view the base model with custom code disabled. Decorated mesh export requires enabling the code.",
      ].join("\n\n"),
      buttons,
    });
    if (choice === 1 || (choice === 2 && seal)) {
      await this.device.grant({
        scope,
        key,
        name: seal?.name ?? "Unsigned",
        ...(choice === 1 ? { digest } : {}),
      });
      return "allow";
    }
    return workspace && choice === buttons.length - 1 ? "empty" : "deny";
  }
  async publish(scope: Scope, digest?: string): Promise<Seal | undefined> {
    if (!digest) return undefined;
    const origin = this.origins[scope];
    if (origin?.digest === digest) return origin.seal;
    if (origin?.invalid)
      throw new Error(
        `The ${scope} signature is invalid. Remove this content before publishing changes.`,
      );
    let author: Author;
    try {
      author = await this.device.identity();
    } catch (error) {
      if (
        (await this.device.ask({
          message: "Signing key unavailable",
          detail: String(error) + " You can save this changed content unsigned.",
          buttons: ["Cancel save", "Save unsigned"],
        })) === 1
      )
        return undefined;
      throw error;
    }
    if (scope === "decorators" || !origin?.seal || origin.seal.key !== author.key) {
      const from =
        origin?.seal && origin.seal.key !== author.key
          ? `The previous version was signed by ${origin.seal.name}. `
          : "";
      const subject = scope === "workspace" ? "workspace" : "custom decorators";
      const endorsement =
        scope === "workspace" ? "the entire workspace" : "all included custom decorators";
      const answer = await this.device.ask({
        message: `Sign the ${subject} as ${author.name}?`,
        key: author.key,
        detail:
          from +
          `By signing, you personally vouch for the trustworthiness of ${endorsement}, including content from other people. Recipients who trust your key for this kind of content may use it without a warning. Choose Save unsigned if you have not reviewed it.`,
        buttons: ["Save unsigned", "Sign with my key", "Cancel save"],
      });
      if (answer === 0) return undefined;
      if (answer !== 1) throw new Error("Save cancelled.");
    }
    const seal = await this.device.sign(scope, digest, author);
    if (
      !(await this.device.grants()).some(
        (g) => g.scope === scope && g.key === author.key && !g.digest,
      )
    )
      await this.device.grant({ name: author.name, key: author.key, scope });
    return seal;
  }
}
