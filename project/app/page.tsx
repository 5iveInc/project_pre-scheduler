// import Image from "next/image";

import Link from "next/link";

export default function Home() {
  return (
      <main className="">
        <div className="p-10">
          <h2 className="text-3xl mb-4">Pages</h2>

          <ul className="list-disc list-inside">
            <li className="">
              <Link href="/user">ユーザー一覧</Link>
            </li>
            <li className="">
              <Link href="/project">案件一覧</Link>
            </li>
          </ul>
        </div>
      </main>
  );
}
