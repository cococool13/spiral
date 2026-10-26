import Footer from "@/components/Footer";
import JsonLd from "@/components/JsonLd";
import Landing from "@/components/Landing";
import PriceBand from "@/components/PriceBand";

export default function Home() {
  return (
    <>
      <JsonLd />
      <Landing>
        <PriceBand />
      </Landing>
      <Footer />
    </>
  );
}
