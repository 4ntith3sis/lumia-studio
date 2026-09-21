import Image from 'next/image';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';

export default function HomeScreen() {
  return (
    <AppLayout>
      <div className="home-hero">
        <div className="home-hero-text">
          <h1 className="home-title">
            More Than Just<br />
            Photos, It&rsquo;s A<br />
            <span>Memory</span>
          </h1>
          <p className="home-desc">
            Bikin momen seru jadi tak terlupakan bersama Lumia!
          </p>
          <Link href="/jumlah-foto" className="btn-primary">
            Mulai
          </Link>
        </div>

        <div className="home-illustration-container">
          <span className="spark-star star-1">&#10039;</span>
          <span className="spark-star star-2">&#9733;</span>

          <div className="badge-tag badge-lumia-top">Lumia Photobooth</div>
          <div className="badge-tag badge-seru">Photobooth Seru</div>
          <div className="badge-tag badge-instan">Cepat Instan</div>
          <div className="badge-tag badge-kreatif">Kreatif</div>

          <div className="illustration-card-frame">
            <Image
              src="/design-assets/assets/home_illustration.jpg"
              alt="Lumia Photobooth Illustration"
              fill
              className="illustration-img"
            />
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
