import { Document, Font, Image, Page, renderToBuffer, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import { REGELS_KERNKOZIJNEN } from "../prijs/regels-kernkozijnen";
import { tekenInhoud } from "../tekening/tekenen";
import { leesConfiguratie, positieOmschrijving } from "../projecten/positie";
import { pdfTekst } from "../offerte/pdf/tekst";
import { svgOnderdelen } from "../offerte/pdf/svg";
import { BEDRIJF_FACTUUR } from "../facturatie/bedrijf";
import { meerwerkTotaal, urenOverzicht, urenTekst, type Werkbon } from "./werkbon";
import { euroTekst } from "../offerte/bereken";

Font.registerHyphenationCallback((woord) => [woord]);

// Huisstijl KernKozijnen: groen en terracotta op zand.
const GROEN = "#24332B";
const TERRA = "#B35B40";
const ZAND = "#EFEBE3";
const LIJN = "#DFD8CB";
const INK = "#23272A";
const GRIJS = "#656D76";

const s = StyleSheet.create({
  pagina: { fontFamily: "Helvetica", fontSize: 10, color: INK, paddingBottom: 64 },
  tekst: { lineHeight: 1.4 },
  kop: { backgroundColor: GROEN, color: "#FFFFFF", paddingVertical: 20, paddingHorizontal: 36, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  kopNaam: { fontSize: 19, fontFamily: "Helvetica-Bold", lineHeight: 1.15 },
  kopPayoff: { fontSize: 9, marginTop: 5, color: "#C3D0C6" },
  inhoud: { paddingHorizontal: 36, paddingTop: 20 },
  titel: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  klein: { fontSize: 9, color: GRIJS },
  vet: { fontFamily: "Helvetica-Bold" },
  koptekst: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 6 },
  rij: { flexDirection: "row", justifyContent: "space-between" },
  blokken: { flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  metaRij: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.5, width: 230 },
  waarschuwing: { backgroundColor: "#FBE9E4", borderWidth: 1, borderColor: TERRA, borderRadius: 4, padding: 8, marginTop: 10, fontSize: 9, color: "#8A3A24" },
  kozijn: { borderWidth: 1, borderColor: LIJN, borderRadius: 5, padding: 8, marginBottom: 8 },
  kozijnKop: { flexDirection: "row", alignItems: "center" },
  tekening: { width: 56, height: 56, backgroundColor: ZAND, borderRadius: 4, marginRight: 10, alignItems: "center", justifyContent: "center" },
  vinkRij: { flexDirection: "row", flexWrap: "wrap", marginTop: 6 },
  vink: { width: "50%", fontSize: 9, paddingVertical: 1 },
  fotoRij: { flexDirection: "row", flexWrap: "wrap", marginTop: 6 },
  foto: { width: 82, height: 82, marginRight: 6, marginBottom: 6, borderRadius: 3, objectFit: "cover" },
  tabelKop: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: INK, paddingBottom: 3, fontFamily: "Helvetica-Bold", fontSize: 9, color: GRIJS },
  tabelRegel: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: LIJN, paddingVertical: 3 },
  akkoord: { marginTop: 18, borderWidth: 1.5, borderColor: TERRA, borderRadius: 6, padding: 12 },
  handtekening: { width: 190, height: 52, marginTop: 6, marginBottom: 4 },
  voet: { position: "absolute", bottom: 22, left: 36, right: 36, borderTopWidth: 1, borderTopColor: LIJN, paddingTop: 7, flexDirection: "row", justifyContent: "space-between" },
  voetTekst: { fontSize: 8, color: GRIJS },
});

export interface WerkbonPdfKozijn {
  positieId: string;
  nummer: number;
  ruimte: string | null;
  aantal: number;
  config: unknown;
  gewijzigd: boolean;
  maten: { bestel: string | null; binnen: string | null; buiten: string | null; opmerking: string | null };
  regel: { geplaatst: boolean; afgesteld: boolean; afgekit: boolean; afgewerkt: boolean; opmerking: string | null } | null;
  fotosNa: Uint8Array[];
}

export interface WerkbonPdfGegevens {
  werkbon: Werkbon;
  klantNaam: string;
  adresRegels: string[];
  projectNummer: string;
  projectNaam: string;
  ploeg: string;
  collegas: string[];
  startDatum: string;
  eindDatum: string;
  kozijnen: WerkbonPdfKozijn[];
  extras: { omschrijving: string; aantal: number; kozijn: string | null }[];
  puntFotos: Uint8Array[];
  /** Het handtekeningbeeld (PNG als data-URL), alleen na de oplevering. */
  handtekening: string | null;
}

const datum = (iso: string) => new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Amsterdam" }).format(new Date(`${iso.slice(0, 10)}T12:00:00Z`));
const datumTijd = (iso: string) => new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" }).format(new Date(iso));
const jpg = (data: Uint8Array) => ({ data: Buffer.from(data), format: "jpg" as const });

function tekeningOnderdelen(config: unknown) {
  try { return svgOnderdelen(tekenInhoud(REGELS_KERNKOZIJNEN, { ...leesConfiguratie(config) })); } catch { return null; }
}

function Tekening({ config }: { config: unknown }) {
  const onderdelen = tekeningOnderdelen(config);
  if (!onderdelen) return <Text style={s.klein}>Geen tekening</Text>;
  return <Svg viewBox="0 0 200 200" width={50} height={50}>{onderdelen}</Svg>;
}

function omschrijving(config: unknown): string {
  try { return positieOmschrijving(REGELS_KERNKOZIJNEN, leesConfiguratie(config)); } catch { return ""; }
}

const CHECKS = [["geplaatst", "Geplaatst"], ["afgesteld", "Afgesteld, alles sluit en werkt"], ["afgekit", "Afgekit"], ["afgewerkt", "Binnen afgewerkt"]] as const;

export function WerkbonDocument({ g }: { g: WerkbonPdfGegevens }) {
  const w = g.werkbon;
  const opgeleverd = w.status === "opgeleverd";
  const uren = urenOverzicht(w.uren);
  const b = BEDRIJF_FACTUUR;
  const kozijnLabel = (id: string | null) => { const k = g.kozijnen.find((x) => x.positieId === id); return k ? `Pos. ${k.nummer}${k.ruimte ? ` (${k.ruimte})` : ""}` : "Hele project"; };
  const open = w.punten.filter((p) => p.status === "open").length;

  return (
    <Document title={`Werkbon ${g.projectNummer}`} author={b.naam}>
      <Page size="A4" style={s.pagina}>
        <View style={s.kop}>
          <View>
            <Text style={s.kopNaam}>{pdfTekst(b.naam)}</Text>
            <Text style={s.kopPayoff}>Kwaliteit in kunststof. Vertrouwd thuis.</Text>
          </View>
          <Text style={{ fontSize: 9, color: "#C3D0C6" }}>{pdfTekst(`${b.plaats} - ${b.telefoon}\n${b.email}`)}</Text>
        </View>

        <View style={s.inhoud}>
          <Text style={s.titel}>{opgeleverd ? "Werkbon en opleverbewijs" : "Werkbon (nog niet opgeleverd)"}</Text>
          <Text style={s.klein}>{pdfTekst(`Project ${g.projectNummer} - ${g.projectNaam}`)}</Text>
          {!opgeleverd && <Text style={s.waarschuwing}>Deze werkbon is nog niet opgeleverd en kan nog veranderen. Er is nog geen handtekening van de klant.</Text>}

          <View style={s.blokken}>
            <View>
              <Text style={s.vet}>{pdfTekst(g.klantNaam)}</Text>
              {g.adresRegels.map((r, i) => <Text key={i}>{pdfTekst(r)}</Text>)}
            </View>
            <View>
              <View style={s.metaRij}><Text style={s.klein}>Ploeg</Text><Text style={s.vet}>{pdfTekst(g.ploeg)}</Text></View>
              {g.collegas.length > 0 && <View style={s.metaRij}><Text style={s.klein}>Monteurs</Text><Text>{pdfTekst(g.collegas.join(", "))}</Text></View>}
              <View style={s.metaRij}><Text style={s.klein}>Montage</Text><Text>{pdfTekst(g.startDatum === g.eindDatum ? datum(g.startDatum) : `${datum(g.startDatum)} t/m ${datum(g.eindDatum)}`)}</Text></View>
              {opgeleverd && w.opgeleverd_op && <View style={s.metaRij}><Text style={s.klein}>Opgeleverd</Text><Text style={s.vet}>{pdfTekst(datumTijd(w.opgeleverd_op))}</Text></View>}
            </View>
          </View>

          <Text style={s.koptekst}>Kozijnen</Text>
          {g.kozijnen.map((k) => (
            <View key={k.positieId} style={s.kozijn} wrap={false}>
              <View style={s.kozijnKop}>
                <View style={s.tekening}><Tekening config={k.config} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.vet}>{pdfTekst(`Pos. ${k.nummer}${k.ruimte ? ` - ${k.ruimte}` : ""}${k.aantal > 1 ? ` - ${k.aantal}x` : ""}`)}</Text>
                  <Text style={s.klein}>{pdfTekst(omschrijving(k.config))}{k.gewijzigd ? " (aangepast tijdens de inmeting)" : ""}</Text>
                  <Text style={s.klein}>{pdfTekst([k.maten.bestel && `Kozijnmaat ${k.maten.bestel}`, k.maten.binnen && `binnen ${k.maten.binnen}`, k.maten.buiten && `buiten ${k.maten.buiten}`].filter(Boolean).join(" - "))}</Text>
                </View>
              </View>
              <View style={s.vinkRij}>
                {CHECKS.map(([sleutel, label]) => <Text key={sleutel} style={s.vink}>{pdfTekst(`${k.regel?.[sleutel] ? "[x]" : "[ ]"} ${label}`)}</Text>)}
              </View>
              {k.regel?.opmerking && <Text style={[s.tekst, { marginTop: 4 }]}>{pdfTekst(`Opmerking monteur: ${k.regel.opmerking}`)}</Text>}
              {k.maten.opmerking && <Text style={[s.klein, { marginTop: 2 }]}>{pdfTekst(`Opmerking inmeting: ${k.maten.opmerking}`)}</Text>}
              {k.fotosNa.length > 0 && (
                <View style={s.fotoRij}>
                  {/* eslint-disable-next-line jsx-a11y/alt-text -- het Image-onderdeel van react-pdf kent geen alt */}
                  {k.fotosNa.map((f, i) => <Image key={i} src={jpg(f)} style={s.foto} />)}
                </View>
              )}
            </View>
          ))}

          {g.extras.length > 0 && (
            <>
              <Text style={s.koptekst}>Extra&apos;s (goedgekeurd door de klant)</Text>
              {g.extras.map((e, i) => <Text key={i}>{pdfTekst(`${e.omschrijving}${e.aantal > 1 ? ` (${e.aantal}x)` : ""} - ${kozijnLabel(e.kozijn)}`)}</Text>)}
            </>
          )}

          {w.bijzonderheden && (
            <View wrap={false}>
              <Text style={s.koptekst}>Bijzonderheden</Text>
              <Text style={s.tekst}>{pdfTekst(w.bijzonderheden)}</Text>
              <Text style={[s.klein, { marginTop: 3 }]}>{w.opgeruimd ? "Opgeruimd en schoon achtergelaten." : "Opruimen niet bevestigd."}</Text>
            </View>
          )}

          {w.meerwerk.some((x) => x.status === "akkoord") && (
            <View wrap={false}>
              <Text style={s.koptekst}>Meerwerk (klant akkoord)</Text>
              {w.meerwerk.filter((x) => x.status === "akkoord").map((x) => <Text key={x.id} style={s.tekst}>{pdfTekst(`${x.omschrijving}${x.aantal > 1 ? ` (${x.aantal}x)` : ""} - ${kozijnLabel(x.positie_id)} - ${euroTekst(x.meerprijs, 2)} incl. btw`)}</Text>)}
              <Text style={[s.klein, { marginTop: 3 }]}>{pdfTekst(`Totaal goedgekeurd meerwerk: ${euroTekst(meerwerkTotaal(w.meerwerk, "akkoord"), 2)} incl. btw. De klant heeft hiervoor getekend.`)}</Text>
            </View>
          )}

          {w.punten.length > 0 && (
            <View wrap={false}>
              <Text style={s.koptekst}>Opleverpunten</Text>
              {w.punten.map((p) => <Text key={p.id} style={s.tekst}>{pdfTekst(`${p.status === "opgelost" ? "[opgelost]" : "[open]"} ${p.omschrijving} - ${kozijnLabel(p.positie_id)}`)}</Text>)}
              {/* eslint-disable-next-line jsx-a11y/alt-text -- het Image-onderdeel van react-pdf kent geen alt */}
              {g.puntFotos.length > 0 && <View style={s.fotoRij}>{g.puntFotos.map((f, i) => <Image key={i} src={jpg(f)} style={s.foto} />)}</View>}
            </View>
          )}

          <View wrap={false}>
            <Text style={s.koptekst}>Uren</Text>
            {w.uren.length === 0 ? <Text style={s.klein}>Geen uren geschreven.</Text> : (
              <>
                <View style={s.tabelKop}><Text style={{ flex: 2 }}>Monteur</Text><Text style={{ flex: 2 }}>Dag</Text><Text style={{ flex: 1, textAlign: "right" }}>Uren</Text></View>
                {w.uren.map((u, i) => (
                  <View key={i} style={s.tabelRegel}><Text style={{ flex: 2 }}>{pdfTekst(u.monteur)}</Text><Text style={{ flex: 2 }}>{pdfTekst(datum(u.datum))}</Text><Text style={{ flex: 1, textAlign: "right" }}>{pdfTekst(urenTekst(u.uren))}</Text></View>
                ))}
                <View style={[s.tabelRegel, { borderBottomWidth: 0 }]}><Text style={[s.vet, { flex: 4 }]}>Totaal</Text><Text style={[s.vet, { flex: 1, textAlign: "right" }]}>{pdfTekst(urenTekst(uren.totaal))}</Text></View>
              </>
            )}
          </View>

          {opgeleverd && w.akkoord && (
            <View style={s.akkoord} wrap={false}>
              <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold", marginBottom: 4 }}>Oplevering</Text>
              <Text style={s.tekst}>{pdfTekst(`Opgeleverd en getekend door ${w.akkoord.naam} op ${datumTijd(w.akkoord.op)}.`)}</Text>
              {w.akkoord.met_voorbehoud && <Text style={[s.tekst, { marginTop: 3 }]}>{pdfTekst(`Met voorbehoud: ${open} van de ${w.punten.length} opleverpunt${w.punten.length === 1 ? "" : "en"} ${open === 1 ? "stond" : "stonden"} open bij het tekenen.`)}</Text>}
              {/* eslint-disable-next-line jsx-a11y/alt-text -- het Image-onderdeel van react-pdf kent geen alt */}
              {g.handtekening ? <Image src={g.handtekening} style={s.handtekening} /> : null}
              <Text style={s.klein}>Naam, handtekening, tijdstip, IP-adres en apparaat zijn bij het tekenen vastgelegd.</Text>
            </View>
          )}
        </View>

        <View style={s.voet} fixed>
          <Text style={s.voetTekst}>{pdfTekst(`${b.naam} - ${b.plaats} - ${b.telefoon} - ${b.email}`)}</Text>
          <Text style={s.voetTekst} render={({ pageNumber, totalPages }) => `Pagina ${pageNumber} van ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function maakWerkbonPdf(g: WerkbonPdfGegevens): Promise<Buffer> {
  return renderToBuffer(<WerkbonDocument g={g} />);
}
