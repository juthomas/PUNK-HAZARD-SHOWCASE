import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "contact@punkhazard.org";

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.container}>
          <span className={styles.badge}>Ingénierie • France</span>
          <h1 className={`${styles.heroTitle} ${styles.balloon} ${styles.glitchTitle}`} data-text="PUNK HAZARD">PUNK HAZARD</h1>
          <p className={`${styles.subtitle} ${styles.terminalLine}`}>
            Conception de PCB, programmation embarquée, électronique et robots. Du prototype à
            l’industrialisation.
          </p>
          <div className={styles.ctas}>
            <a
              className={styles.primary}
              href={`mailto:${contactEmail}?subject=Demande de devis — PUNKHAZARD`}
            >
              Demander un devis
            </a>
            <a className={styles.secondary} href="#services">Voir les services</a>
          </div>
        </div>
      </header>

      <main>
        <section id="services" className={styles.section}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>Services</h2>
            <div className={styles.grid}>
              {/* <div className={styles.card}>
                <h3>Conception 3D</h3>
                <p>Conception mécanique légère et intégration scénique.</p>
                <ul>
                  <li>CAO, prototypage (impression 3D/CNC)</li>
                  <li>Intégration scénique et ergonomie</li>
                  <li>Assemblage et finitions</li>
                </ul>
              </div> */}
              <div className={styles.card}>
                <h3>Conception PCB</h3>
                <p>Schémas, routage et préparation à la fabrication.</p>
                <ul>
                  <li>KiCad</li>
                  <li>DFM, BOM</li>
                  <li>Prototypage et assemblage</li>
                </ul>
              </div>
              <div className={styles.card}>
                <h3>Électronique & programmation</h3>
                <p>Firmware et électronique adaptés aux projets interactifs.</p>
                <ul>
                  <li>Microcontrôleurs (STM32, ESP32, AVR)</li>
                  <li>Capteurs, interfaces, audio</li>
                  <li>Lumières (DMX/Art‑Net), synchronisation</li>
                </ul>
              </div>
              <div className={styles.card}>
                <h3>Intégration complète</h3>
                <p>Électronique, 3D et logiciel, coordonnés pour la scène.</p>
                <ul>
                  <li>Architecture et intégration multi‑disciplines</li>
                  <li>Démonstrations/performances, synchro audio‑lumière</li>
                  <li>Accompagnement de l’idée à la scène</li>
                </ul>
              </div>
              {/* <div className={styles.card}>
                <h3>Électronique</h3>
                <p>Conception analogique et numérique.</p>
                <ul>
                  <li>Alim, capteurs, puissance</li>
                  <li>Mesure, acquisition de données</li>
                  <li>Tests et validation</li>
                </ul>
              </div> */}
              {/* <div className={styles.card}>
                <h3>Robots</h3>
                <p>Mécatronique et contrôle de mouvement.</p>
                <ul>
                  <li>ROS/ROS2</li>
                  <li>Vision, navigation</li>
                  <li>Actionneurs, drivers</li>
                </ul>
              </div> */}
              <div className={styles.card}>
                <h3>Go2 (Unitree) — création sur mesure</h3>
                <p>Robot quadrupède adapté aux performances artistiques, installations et R&D.</p>
                <ul>
                  <li>Logiciel et hardware sur mesure (SDK/ROS, capteurs, interfaces)</li>
                  <li>Chorégraphies/scénographie, synchronisation audio‑lumière</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* <section id="realisations" className={styles.section}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>Réalisations</h2>
            <div className={styles.workGrid}>
              <div className={styles.card}>
                <h3>Installation lumineuse interactive</h3>
                <div className={styles.workMeta}>
                  <span className={styles.tag}>Lumières</span>
                  <span className={styles.tag}>DMX/Art‑Net</span>
                  <span className={styles.tag}>Capteurs</span>
                  <span className={styles.tag}>Conception 3D</span>
                </div>
                <p>Dispositif scénique piloté en temps réel, synchronisé audio‑lumière avec retours capteurs.</p>
              </div>

              <div className={styles.card}>
                <h3>Sculpture sonore réactive</h3>
                <div className={styles.workMeta}>
                  <span className={styles.tag}>Audio</span>
                  <span className={styles.tag}>Capteurs</span>
                  <span className={styles.tag}>PCB custom</span>
                  <span className={styles.tag}>ESP32</span>
                </div>
                <p>Électronique et firmware dédiés pour modulations et effets synchronisés aux interactions.</p>
              </div>

              <div className={styles.card}>
                <h3>Performance robotique Go2 (Unitree)</h3>
                <div className={styles.workMeta}>
                  <span className={styles.tag}>Unitree Go2</span>
                  <span className={styles.tag}>SDK</span>
                  <span className={styles.tag}>ROS2</span>
                  <span className={styles.tag}>Chorégraphie</span>
                </div>
                <p>Mouvements scénographiés, synchronisation avec lumière et audio, intégrations sur mesure.</p>
              </div>
            </div>
          </div>
        </section> */}

        <section id="expertise" className={styles.sectionAlt}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>Expertise & Stack</h2>
            <div className={styles.chips}>
              <span className={styles.chip}>KiCad</span>
              <span className={styles.chip}>STM32</span>
              <span className={styles.chip}>ESP32</span>
              <span className={styles.chip}>C/C++</span>
              <span className={styles.chip}>Rust</span>
              <span className={styles.chip}>Python</span>
              <span className={styles.chip}>ROS/ROS2</span>
              <span className={styles.chip}>BLE</span>
              <span className={styles.chip}>Wi‑Fi</span>
              <span className={styles.chip}>LoRa</span>
              <span className={styles.chip}>Unitree Go2</span>
              <span className={styles.chip}>Unitree SDK</span>
            </div>
          </div>
        </section>

        <section id="processus" className={styles.section}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>Approche</h2>
            <ol className={styles.steps}>
              <li>
                <strong>Découverte</strong>
                <span> — besoins, contraintes, objectifs.</span>
              </li>
              <li>
                <strong>Conception</strong>
                <span> — architecture, schémas, routage.</span>
              </li>
              <li>
                <strong>Prototype</strong>
                <span> — fabrication, assemblage, tests.</span>
              </li>
              <li>
                <strong>Industrialisation</strong>
                <span> — validation, documentation, transfert.</span>
              </li>
            </ol>
          </div>
        </section>

        <section id="contact" className={styles.sectionAlt}>
          <div className={styles.container}>
            <h2 className={styles.sectionTitle}>Contact</h2>
            <p className={styles.contactText}>Discuter de votre projet. Réponse rapide, devis gratuit.</p>
            <div className={styles.ctas}>
              <a
                className={styles.primary}
                href={`mailto:${contactEmail}?subject=Projet — PUNKHAZARD`}
              >
                Prendre contact
              </a>
              <Link className={styles.secondary} href="#services">Voir les services</Link>
            </div>
            <p className={styles.contactLine}>
              <span>Email</span>
              <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
            </p>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.container}>
          <p>© {new Date().getFullYear()} PUNKHAZARD — Tous droits réservés.</p>
        </div>
      </footer>
    </div>
  );
}
