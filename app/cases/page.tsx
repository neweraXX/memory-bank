import { CASES } from "@/lib/cases.ts";
import CaseLibrary from "./CaseLibrary.tsx";

export const metadata = { title: "Case library · Memory Bank" };

export default function Page() {
  return <CaseLibrary cases={CASES} />;
}
