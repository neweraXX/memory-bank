import samples from "@/data/samples.json" with { type: "json" };
import { CASES } from "@/lib/cases.ts";
import MemoryBank from "./MemoryBank.tsx";

export default function Home() {
  return <MemoryBank cases={CASES} samples={samples.map(({ label, text }) => ({ label, text }))} />;
}
