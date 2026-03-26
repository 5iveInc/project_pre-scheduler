// import Image from "next/image";

import Link from "next/link";

export default function Home() {
  return (
      <main className="">
        <h2 className="">Pages</h2>

        <ul className="">
          <li>
            <Link href="/user">ユーザー</Link>
          </li>
        </ul>
      </main>
  );
}
