import type { Metadata } from "next";
import AppPageLayout from "@/components/app-page/AppPageLayout";
import { appPage } from "@/lib/appPages";

const page = appPage("clean");

export const metadata: Metadata = {
  title: page.title,
  description: page.description,
  openGraph: { title: page.title, description: page.description, type: "website" },
};

export default function CleanPage() {
  return <AppPageLayout page={page} />;
}
