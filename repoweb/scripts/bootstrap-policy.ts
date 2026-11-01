type BootstrapOptions = {
  source: "pglite" | "neon";
  seedDemo: () => Promise<void>;
  provisionOwner: () => Promise<void>;
};

export async function runBootstrap({ source, seedDemo, provisionOwner }: BootstrapOptions) {
  if (source === "pglite") await seedDemo();
  else await provisionOwner();
}
