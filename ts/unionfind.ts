class UnionFind<Type> {
    cc: number
    mapping: Map<string, number>
    id: Array<number>
    rank: Array<number>
    size: Array<number>
    constructor(collection: Iterable<Type>) {
        this.cc = 0;
        this.mapping = new Map();
        for (const elem of collection) {
            const key = elem.toString();
            if (this.mapping.has(key)) { continue; }
            this.mapping.set(key, this.cc);
            this.cc++;
        }
        this.id = [];
        this.rank = [];
        this.size = [];
        for (let i = 0; i < this.cc; i++) {
            this.id[i] = i;
            this.rank[i] = 0;
            this.size[i] = 1;
        }
    }

    #find(x: number) {
        if (this.id[x] !== x) {
            this.id[x] = this.#find(this.id[x]);
        }
        return this.id[x];
    }

    #id(x: Type) {
        return this.mapping.get(x.toString());
    }

    #union(x: number, y: number) {
        const a = this.#find(x);
        const b = this.#find(y);
        if (a === b) { return; }
        this.cc--;
        if (this.rank[a] > this.rank[b]) {
            this.id[b] = a;
            this.size[a] += this.size[b];
        } else if (this.rank[a] < this.rank[b]) {
            this.id[a] = b;
            this.size[b] += this.size[a];
        } else {
            this.id[b] = a;
            this.size[a] += this.size[b];
            this.rank[a]++;
        }
    }

    find(x: Type) { return this.#find(this.#id(x)); }

    union(x: Type, y: Type) {
        this.#union(this.#id(x), this.#id(y));
    }

    cc_size(x: Type) { return this.size[this.find(x)]; }

    cc_count() { return this.cc; }

    print() {
        const groups = new Map<number, string[]>();
        for (const [k, kk] of this.mapping) {
            if (groups.has(this.#find(kk))) {
                groups.get(this.#find(kk)).push(k);
            } else {
                groups.set(this.#find(kk), [k]);
            }
        }
        console.log(groups);
    }
};

export default UnionFind;

